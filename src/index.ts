import { createConnection, Like } from 'typeorm';
import parser from 'xml2json';
import htmlParser from 'html2json';
import axios, { AxiosRequestConfig } from 'axios';
import config from 'config';
import Bluebird from 'bluebird';
import path from 'path';
import cron from 'node-cron';
import http from 'http';

import { Anime } from './persistance/Anime.model';

import { IAnimeData, IJson } from './interface';

const startCronTask = async () => {
  await createConnection();
  await checkForDownload();
  cron.schedule('0 0 */1 * * *', async () => {
    await checkForDownload();
  });
};

const checkForDownload = async () => {
  const response = await axios.get(config.get('rss.url'));
  const json = <IJson>JSON.parse(parser.toJson(response.data));
  const animes = await Anime.find();
  const addList = animes.reduce(
    (acc: string[], curr) => acc.concat(curr.name),
    []
  );

  await Bluebird.map(
    json.rss.channel.item,
    async item => {
      const name = item.title
        .replace('[SubsPlease] ', '')
        .split(' (1080p) ')[0];
      const splitTitle = name.split(' - ');

      const animeEp = parseInt(splitTitle[splitTitle.length - 1]);
      const animeName = name.replace(
        ` - ${splitTitle[splitTitle.length - 1]}`,
        ''
      );

      if (addList.includes(animeName)) {
        const anime = await Anime.findOne({ name: Like(`${animeName}%`) });
        if (anime && animeEp > anime.episode) {
          addTorrent(animeName, item.link);
          await Anime.update({ id: anime.id }, { episode: animeEp });
        }
      }
    },
    { concurrency: 1 }
  );
};

const getSessionId = async () => {
  return new Promise(async resolve => {
    try {
      const options: AxiosRequestConfig = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transmission-Session-Id': '',
        },
        data: {
          method: 'session-get',
        },
        url: config.get('transmission.url'),
        auth: config.get('transmission.auth'),
      };

      await axios(options);
    } catch (e) {
      resolve(e.response.headers['x-transmission-session-id']);
    }
  });
};

const addTorrent = async (animeName: string, filename: string) => {
  const transmissionSessionId = await getSessionId();
  const options: AxiosRequestConfig = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Transmission-Session-Id': transmissionSessionId,
    },
    auth: config.get('transmission.auth'),
    data: {
      arguments: {
        'download-dir': path.join(
          config.get('transmission.download.dir'),
          animeName
        ),
        filename: filename,
        paused: false,
      },
      method: 'torrent-add',
    },
    url: config.get('transmission.url'),
  };

  return await axios(options);
};

const startServer = async () => {
  http
    .createServer(async (req, res) => {
      const response = await axios.get(
        `https://subsplease.org/api/?f=show&tz=Asia/Kuala_Lumpur&sid=${req.url.replace(
          '/',
          ''
        )}`
      );

      const animeData = <IAnimeData[]>Object.values(response.data);

      await Bluebird.map(
        animeData,
        async anime => {
          await addTorrent(
            anime.show,
            anime.downloads[anime.downloads.length - 1].magnet
          );
        },
        { concurrency: 1 }
      );

      await Anime.update(
        { name: animeData[0].show },
        { episode: parseInt(animeData[0].episode) }
      );

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write(`ok ${req.url}`);
      res.end();
    })
    .listen(8081);
};

try {
  startCronTask();
  startServer();
} catch (err) {
  console.error('err', err);
}
