declare module "terabox-api" {
  export default class TeraBoxApp {
    constructor(ndus: string);
    data: {
      jsToken: string;
      bdstoken: string;
      csrf: string;
    };
    params: {
      cookie: string;
      ua: string;
      whost: string;
    };
    updateAppData(customPath?: string): Promise<unknown>;
    getRemoteDir(dir: string, page?: number): Promise<{
      errno: number;
      errmsg?: string;
      list?: Array<{
        fs_id: number;
        server_filename: string;
        path: string;
        size: number;
        isdir: number;
      }>;
    }>;
    download(fs_ids: number[]): Promise<{
      errno: number;
      errmsg?: string;
      dlink?: string[];
    }>;
  }
}
