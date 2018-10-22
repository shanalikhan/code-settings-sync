"use strict";

import { File } from "./fileService";

export class AccountService {
  constructor() {
    const formData = {
      "form[title]": "0123456789abcdef",
      "form[type]": "text",
      "form[content]": "abcdef"
      // gist: {
      // Id: 66,
      // Title: "test prod",
      // Cipher: false,
      // Type: "javascript",
      // File: "55abcfa7771e0",
      // CreatedAt: "2015-07-19T16:26:15Z",
      // UpdatedAt: "2015-07-19T16:26:15Z"
      // }
    };
    // const request = require("request");
    // request.post(
    //   {
    //     url:
    //       "https://gist.deblan.org/en/api/create/usqcybFhu9Bm7YCqY0qyznAxrv5rwSFv",
    //     form: formData
    //   },
    //   function(err, httpResponse, body) {
    //     console.log("test");
    //     console.log(err, body);
    //   }
    // );
  }

  // public ReadGist() {
  //   const formData = {
  //     title: "0123456789abcdef",
  //     type: "text",
  //     content: "abcdef"
  //   };
  //   const request = require("request");
  //   request.post(
  //     {
  //       url:
  //         "https://gist.deblan.org/en/api/create/usqcybFhu9Bm7YCqY0qyznAxrv5rwSFv",
  //       form: formData
  //     },
  //     function(err, httpResponse, body) {
  //       console.log(err, body);
  //     }
  //   );
  //   // return await ; : Promise<any>
  // }

  /**
   * ReadGist
   */
  public ReadGist(gistURL) {
    const request = require("request");
    request.get(
      {
        url: gistURL
      },
      function(err, httpResponse, body) {
        console.log("read gist" + gistURL);
        console.log(err, body);
      }
    );
  }

  /**
   * ListGist
   */
  public ListGist() {
    // const EventEmitter = require("events").EventEmitter;
    // const data = new EventEmitter();
    const request = require("request");
    // request.get(
    //   {
    //     url:
    //       "https://gist.deblan.org/en/api/list/usqcybFhu9Bm7YCqY0qyznAxrv5rwSFv"
    //   },
    //   (err, httpResponse, body) => {
    //     console.log(err, body);
    //     const allGists = JSON.parse(body);
    //     console.log(allGists);
    //     console.log("allgistslength", allGists.length);

    //     for (let gistIndex = 0; gistIndex < allGists.length; gistIndex++) {
    //       const gist = allGists[gistIndex];
    //       const gisturl = gist.url;
    //       console.log(gistIndex, ":", gisturl);
    //       gistURLs.push(gisturl);
    //       // this.ReadGist(gisturl);
    //     }
    //     data.data = gistURLs;
    //     data.emit("update");
    //   }
    // );
    // data.on("update", function() {
    //   gistURLs = data.data;
    // });

    return new Promise(function(resolve, reject) {
      request.get(
        {
          url:
            "https://gist.deblan.org/en/api/list/usqcybFhu9Bm7YCqY0qyznAxrv5rwSFv"
        },
        function(error, response, body) {
          // in addition to parsing the value, deal with possible errors
          if (error) {
            return reject(error);
          }
          try {
            // JSON.parse() can throw an exception if not valid JSON
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }
}
