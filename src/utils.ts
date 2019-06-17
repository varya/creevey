import http from "http";
import { Context } from "mocha";
import { Builder, until, By } from "selenium-webdriver";
import { Config } from "./types";

function getRealIp(): Promise<string> {
  return new Promise((resolve, reject) =>
    http.get("http://fake.dev.kontur/ip", res => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Couldn't resolve real ip for \`localhost\`. Status code: ${res.statusCode}`));
      }

      let data = "";

      res.setEncoding("utf8");
      res.on("data", chunk => (data += chunk));
      res.on("end", () => resolve(data));
    })
  );
}

export async function getBrowser(config: Config, browserName: string) {
  const { gridUrl, address, browsers } = config;
  const capabilities = browsers[browserName];
  const browser = await new Builder()
    .usingServer(gridUrl)
    .withCapabilities(capabilities)
    .build();

  if (address.host === "localhost") {
    address.host = await getRealIp();
  }

  const hostUrl = `http://${address.host}:${address.port}/${address.path}`;
  const storybookQuery = "selectedKind=All&selectedStory=Stories";

  await browser.get(`${hostUrl}?${storybookQuery}`);
  await browser.wait(until.elementLocated(By.css("#root")), 10000);

  return browser;
}

export async function switchStory(this: Context) {
  // TODO add checks and good error messages
  const test = this.currentTest!.title;
  const story = this.currentTest!.parent!.title;
  const kind = this.currentTest!.parent!.parent!.title;

  const { width, height } = await this.browser.executeScript(
    // tslint:disable
    // @ts-ignore
    function(kind, story) {
      window.scrollTo(0, 0);
      // @ts-ignore
      window.renderStory({
        kind: kind,
        story: story
      });
      var bodyRect = document.body.getBoundingClientRect();
      return {
        width: Math.min(document.documentElement.clientWidth, bodyRect.width),
        height: Math.min(document.documentElement.clientHeight, bodyRect.height)
      };
      // tslint:enable
    },
    kind,
    story
  );
  await this.browser
    .actions({ bridge: true })
    .move({
      origin: this.browser.findElement(By.css("body")),
      x: Math.ceil((-1 * width) / 2),
      y: Math.ceil((-1 * height) / 2)
    })
    .perform();

  this.testScope.length = 0;
  this.testScope.push(kind, story, test, this.browserName);
}
