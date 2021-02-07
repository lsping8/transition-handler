import { createConnection, Like } from 'typeorm';
import parser from 'xml2json';
import axios, { AxiosRequestConfig } from 'axios';
import config from 'config';
import Bluebird from 'bluebird';
import path from 'path';
import cron from 'node-cron';
import { createServer } from 'http';
import convert from 'html-to-json-data';
import { group, text, href } from 'html-to-json-data/definitions';
import { startCase } from 'lodash';
import express from 'express';
import bodyParser from 'body-parser';

import { Anime } from './persistance/Anime.model';

import { IConvertedJson, IJson } from './interface';

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

      const animeEp = parseInt(splitTitle[splitTitle.length - 1].slice(0, 2));
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

const crawlNyaa = async (animeName: string, subName: string) => {
  const response = await axios.get(`https://nyaa.si`, {
    params: {
      f: '0',
      c: '0_0',
      q: `${subName}+${startCase(animeName).replace(' ', '+')}+1080`,
    },
  });

  console.log('response', response.data);

  const json: IConvertedJson = convert(response.data, {
    episode: group('table tbody tr', text('td a', '')),
    magnets: group(
      'table tbody tr',
      href('td.text-center a:last-child', 'magnet:?xt=urn:')
    ),
  });

  console.log('json', json);

  return json.magnets.map((magnet, idx) => {
    const text = json.episode[idx]
      .reduce((acc, curr) => {
        if (curr.includes(`[${subName}]`)) return curr;
        return acc;
      }, '')
      .split(' - ');

    return {
      name: text[0].replace(`[${subName}]`, ''),
      episode: text[text.length - 1].slice(0, 2),
      magnet,
    };
  });
};

const startServer = async () => {
  const app = express();
  app.use(bodyParser.json());
  app.post('/', async (req, res) => {
    const nyaaResult = await crawlNyaa(req.body.name, req.body.subName);

    await Bluebird.map(
      nyaaResult,
      async anime => {
        await addTorrent(anime.name, anime.magnet);
      },
      { concurrency: 1 }
    );

    await Anime.update(
      { name: nyaaResult[0].name },
      { episode: parseInt(nyaaResult[0].episode) }
    );

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write(`ok ${req.url}`);
    res.end();
  });

  createServer(app).listen(8081);
};

try {
  startCronTask();
  startServer();
} catch (err) {
  console.error('err', err);
}
