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
