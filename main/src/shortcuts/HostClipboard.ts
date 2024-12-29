import { clipboard, Clipboard } from "electron";
import type { Logger } from "../RemoteLogger";
import { text } from "stream/consumers";

const POLL_DELAY = 48;
const POLL_LIMIT = 500;

// PoE must read clipboard within this timeframe,
// after that we restore clipboard.
// If game lagged for some reason, it will read
// wrong content (= restored clipboard, potentially containing password).
const RESTORE_AFTER = 120;

export class HostClipboard {
  private pollPromise?: Promise<string>;
  private elapsed = 0;
  private shouldRestore = false;

  private isRestored = true;

  get isPolling() {
    return this.pollPromise != null;
  }

  constructor(private logger: Logger) {}

  updateOptions(restoreClipboard: boolean) {
    this.shouldRestore = restoreClipboard;
  }

  async readItemText(): Promise<string> {
    this.elapsed = 0;
    if (this.pollPromise) {
      return await this.pollPromise;
    }

    let textBefore = clipboard.readText();
    if (isPoeItem(textBefore)) {
      textBefore = "";
      clipboard.writeText("");
    }

    this.pollPromise = new Promise((resolve, reject) => {
      const poll = () => {
        let textAfter = clipboard.readText();

        if (isUncutSkillGem(textAfter)) {
          // Insert item class line at start
          textAfter = "Item Class: UncutSkillGem\n" + textAfter;
        }

        if (isPoeItem(textAfter)) {
          if (this.shouldRestore) {
            clipboard.writeText(textBefore);
          }
          this.pollPromise = undefined;
          resolve(textAfter);
        } else {
          this.elapsed += POLL_DELAY;
          if (this.elapsed < POLL_LIMIT) {
            setTimeout(poll, POLL_DELAY);
          } else {
            if (this.shouldRestore) {
              clipboard.writeText(textBefore);
            }
            this.pollPromise = undefined;

            if (!isPoeItem(textAfter)) {
              this.logger.write("warn [ClipboardPoller] No item text found.");
            }
            reject(new Error("Reading clipboard timed out"));
          }
        }
      };
      setTimeout(poll, POLL_DELAY);
    });

    return this.pollPromise;
  }

  // when `shouldRestore` is false, this function continues
  // to work as a throttler for callback
  restoreShortly(cb: (clipboard: Clipboard) => void) {
    // Not only do we not overwrite the clipboard, but we don't exec callback.
    // This throttling helps against disconnects from "Too many actions".
    if (!this.isRestored) {
      return;
    }

    this.isRestored = false;
    const saved = clipboard.readText();
    cb(clipboard);
    setTimeout(() => {
      if (this.shouldRestore) {
        clipboard.writeText(saved);
      }
      this.isRestored = true;
    }, RESTORE_AFTER);
  }
}

function isPoeItem(text: string) {
  return LANGUAGE_DETECTOR.find(({ firstLine }) => text.startsWith(firstLine));
}

function isUncutSkillGem(text: string) {
  const lines = text.split("\n");
  if (lines.length < 2) return false;

  if (
    lines[0].startsWith("Rarity: Currency") &&
    UNCUT_SKILL_GEM_DETECTOR.find(({ firstLine }) =>
      lines[1].startsWith(firstLine)
    )
  ) {
    return true;
  }

  return false;
}

const UNCUT_SKILL_GEM_DETECTOR = [
  {
    lang: "en",
    firstLine: "Uncut Skill Gem",
  },
  {
    lang: "en",
    firstLine: "Uncut Spirit Gem",
  },
  {
    lang: "en",
    firstLine: "Uncut Support Gem",
  },
];

const LANGUAGE_DETECTOR = [
  {
    lang: "en",
    firstLine: "Item Class: ",
  },
  {
    lang: "ru",
    firstLine: "Класс предмета: ",
  },
  {
    lang: "fr",
    firstLine: "Classe d'objet: ",
  },
  {
    lang: "de",
    firstLine: "Gegenstandsklasse: ",
  },
  {
    lang: "pt",
    firstLine: "Classe do Item: ",
  },
  {
    lang: "es",
    firstLine: "Clase de objeto: ",
  },
  {
    lang: "th",
    firstLine: "ชนิดไอเทม: ",
  },
  {
    lang: "ko",
    firstLine: "아이템 종류: ",
  },
  {
    lang: "cmn-Hant",
    firstLine: "物品種類: ",
  },
  {
    lang: "cmn-Hans",
    firstLine: "物品类别: ",
  },
  {
    lang: "ja",
    firstLine: "アイテムクラス: ",
  }
];
