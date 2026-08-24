"use strict";

export class ExtensionMetadata {
  constructor(
    public galleryApiUrl: string,
    public id: string,
    public downloadUrl: string,
    public publisherId: string,
    public publisherDisplayName: string,
    public date: string
  ) {}
}

export class ExtensionInformation {
  public static fromJSON(text: string) {
    try {
      // TODO: JSON.parse may throw error
      // Throw custom error should be more friendly
      const obj = JSON.parse(text);
      const meta = new ExtensionMetadata(
        obj.meta ? obj.meta.galleryApiUrl : "",
        obj.meta ? obj.meta.id : "",
        obj.meta ? obj.meta.downloadUrl : "",
        obj.meta ? obj.meta.publisherId : "",
        obj.meta ? obj.meta.publisherDisplayName : "",
        obj.meta ? obj.meta.date : ""
      );
      const item = new ExtensionInformation();
      item.metadata = meta;
      item.name = obj.name;
      item.publisher = obj.publisher;
      item.version = obj.version;
      item.disabled = !!obj.disabled;
      return item;
    } catch (err) {
      throw new Error(err);
    }
  }

  public static fromJSONList(text: string) {
    const extList: ExtensionInformation[] = [];
    try {
      // TODO: JSON.parse may throw error
      // Throw custom error should be more friendly
      const list = JSON.parse(text);
      list.forEach(obj => {
        const meta = new ExtensionMetadata(
          obj.metadata ? obj.metadata.galleryApiUrl : "",
          obj.metadata ? obj.metadata.id : "",
          obj.metadata ? obj.metadata.downloadUrl : "",
          obj.metadata ? obj.metadata.publisherId : "",
          obj.metadata ? obj.metadata.publisherDisplayName : "",
          obj.metadata ? obj.metadata.date : ""
        );
        const item = new ExtensionInformation();
        item.metadata = meta;
        item.name = obj.name;
        item.publisher = obj.publisher;
        item.version = obj.version;
        item.disabled = !!obj.disabled;

        if (item.name !== "code-settings-sync") {
          extList.push(item);
        }
      });
    } catch (err) {
      throw new Error(err);
    }

    return extList;
  }

  public metadata: ExtensionMetadata;
  public name: string;
  public version: string;
  public publisher: string;
  public disabled?: boolean = false;
}
