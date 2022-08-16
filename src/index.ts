import { createConnection, ILike, Like } from 'typeorm';
import parser from 'xml2json';
import axios, { AxiosRequestConfig } from 'axios';
import config from 'config';
import Bluebird from 'bluebird';
import path from 'path';
import cron from 'node-cron';
import { createServer } from 'http';
import convert from 'html-to-json-data';
import { group, text, href } from 'html-to-json-data/definitions';
import express from 'express';

import { Anime } from './persistance/Anime.model';

import { IConvertedJson, IJson } from './interface';
import { lowerCase } from 'lodash';

const startCronTask = async () => {
  const connection = await createConnection();
  await connection.runMigrations({ transaction: 'all' });
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

      if (
        addList.some(name => lowerCase(animeName).includes(lowerCase(name)))
      ) {
        const anime = await Anime.findOne({
          name: ILike(`${animeName.split(' - ')[0]}%`),
        });
        if (anime && animeEp > anime.episode) {
          addTorrent(animeName, item.link, anime.season);
          console.log(`--- Adding ${animeName} - ${animeEp} ---`);
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

const addTorrent = async (
  animeName: string,
  filename: string,
  season: number
) => {
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
          `${animeName}\\Season ${season}\\`
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

const crawlNyaa = async (
  animeName: string,
  subName: string,
  season: number
) => {
  const response = await axios.get(`https://nyaa.si`, {
    params: {
      f: '0',
      c: '0_0',
      q: `${subName}+${animeName.replace(' ', '+')}+1080`,
    },
  });

  const json: IConvertedJson = convert(response.data, {
    name: group('table tbody tr', text('td a', '')),
    magnets: group(
      'table tbody tr',
      href('td.text-center a:last-child', 'magnet:?xt=urn:')
    ),
  });

  return json.magnets.map((magnet, idx) => {
    const text = json.name[idx]
      .reduce((acc, curr) => {
        if (curr.toLowerCase().includes(`[${subName.toLowerCase()}]`))
          return curr;
        return acc;
      }, '')
      .split(' - ');

    const animeName = text[0].split(' ').slice(1).join(' ');

    return {
      name: animeName,
      episode: text[text.length - 1].slice(0, 2),
      magnet,
      season,
    };
  });
};

const startServer = async () => {
  const app = express();
  app.use(express.json());
  app.get('/', async (req, res) => {
    await checkForDownload();

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write(`ok ${req.url}`);
    res.end();
  });
  app.post('/', async (req, res) => {
    const nyaaResult = await crawlNyaa(
      req.body.name,
      req.body.subName,
      req.body.season
    );
    await Bluebird.map(
      nyaaResult,
      async anime => {
        console.log(`--- Adding ${anime.name} - ${anime.episode} ---`);
        await addTorrent(anime.name, anime.magnet, anime.season);
        const animeQuery = await Anime.findOne({
          name: Like(`${anime.name}%`),
        });
        if (!animeQuery) {
          await Anime.create({
            name: anime.name,
            episode: parseInt(anime.episode),
          }).save();
        } else {
          await Anime.update(
            { id: animeQuery.id },
            { episode: parseInt(anime.episode) }
          );
        }
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
  console.log('Server is ready!');
} catch (err) {
  console.error('err', err);
}
