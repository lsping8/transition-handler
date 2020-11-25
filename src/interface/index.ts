export interface IJson {
  rss: {
    version: string;
    'xmlns:atom': string;
    'xmlns:subsplease': string;
    channel: {
      title: string;
      description: string;
      link: string;
      item: IChannelItem[];
    };
  };
}

interface IChannelItem {
  title: string;
  link: string;
  guid: { isPermaLink: string; $t: string };
  pubDate: string;
  'subsplease:size': string;
}

export interface IAnimeData {
  time: string;
  show: string;
  episode: string;
  downloads: IDownload[];
}

export interface IDownload {
  res: string;
  torrent: string;
  magnet: string;
  xdcc: string;
}
