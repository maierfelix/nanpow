const IS_BROWSER = typeof window !== "undefined";

export default class CrossWorker {

  private _instance: any = null;

  public onmessage: any;

  public constructor(code: string) {
    // Browser
    if (IS_BROWSER) {
      // Create worker blob
      const workerBlob = new Blob([code], {type: "text/javascript"});
      const workerBlobURL = window.URL.createObjectURL(workerBlob);
      this._instance = new Worker(workerBlobURL);
      this._instance.onmessage = (e: any): void => {
        this.onmessage(e);
      };
    }
    // Node
    else {
      const {Worker} = require("worker_threads");
      const worker = new Worker(code, {eval: true});
      worker.on("message", (e: any): void => {
        this.onmessage({data: e});
      });
      this._instance = worker;
    }
  }

  public postMessage(e: any): void {
    if (IS_BROWSER) this._instance.postMessage(e);
    else {
      this._instance.postMessage(e);
    }
  }

}
