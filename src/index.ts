import { createConnection } from 'typeorm';
import parser from 'xml2json';
import axios, { AxiosRequestConfig } from 'axios';
import config from 'config';
import Bluebird from 'bluebird';
import path from 'path';
import cron from 'node-cron';

import { Anime } from './persistance/Anime.model';

import { IJson } from './interface';

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
      const name = item.title.replace('[SubsPlease] ', '');
      const animeName = name.split(' - ')[0];
      const animeEp = parseInt(
        name.replace(`${animeName} - `, '').split(' ')[0]
      );

      if (addList.includes(animeName)) {
        const anime = await Anime.findOne({ name: animeName });
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

try {
  startCronTask();
} catch (err) {
  console.error('err', err);
}
