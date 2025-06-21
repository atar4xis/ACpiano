import { getCurrentRoom, send } from "./socket.js";
import { leetPattern, normalizeHomoglyphs } from "./utils.js";
import {
  $chatInput,
  $messages,
  $chat,
  $emojiButton,
  $msgCtxMenu,
  $copyAuthorUid,
  $copyMsgId,
  $deleteMsg,
} from "./dom.js";
import { BAD_WORDS, EMOJI_SHORTCODES } from "./constants.js";

const chatIsOpen = () => $chat.classList.contains("open");

const msgContent = new Map();
function getMsgContent(msgId) {
  if (msgContent.has(msgId)) return msgContent.get(msgId);
  else return null;
}

export function setupEvents() {
  $chatInput.addEventListener("focus", () => {
    openChat();
  });

  $emojiButton.addEventListener("click", (e) => {
    openEmojiPicker();
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".message") &&
      !e.target.closest("em-emoji-picker") &&
      !e.target.closest("#chat input") &&
      !document.querySelector("em-emoji-picker") &&
      chatIsOpen()
    ) {
      closeChat();
      $chatInput.blur();
    }

    if (
      !e.target.closest("#message-context-menu") &&
      $msgCtxMenu.style.display == "block"
    ) {
      $msgCtxMenu.style.display = "none";
      document.querySelectorAll(".message").forEach(($msg) => {
        $msg.classList.remove("context-menu-open");
      });
    }
  });

  $msgCtxMenu.addEventListener("sl-select", (e) => {
    switch (e.detail.item.id) {
      case "copy-msg-content":
        const msgId = $msgCtxMenu.dataset.msgId;
        if (!msgId) return;

        const msgContent = getMsgContent(msgId);
        if (!msgContent) return;

        navigator.clipboard.writeText(msgContent);
        break;
      case "copy-msg-id":
        navigator.clipboard.writeText($msgCtxMenu.dataset.msgId);
        break;
      case "copy-author-uid":
        navigator.clipboard.writeText($msgCtxMenu.dataset.authorUid);
        break;
      case "delete-msg":
        const $msg = document.querySelector(".message.context-menu-open");
        if ($msg) $msg.remove();
        break;
    }

    $msgCtxMenu.style.display = "none";
    document.querySelectorAll(".message").forEach(($msg) => {
      $msg.classList.remove("context-menu-open");
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && chatIsOpen()) {
      closeChat();
      $chatInput.blur();
      e.preventDefault();
    }

    if (e.key === "Enter") {
      e.preventDefault();

      if (!chatIsOpen()) {
        openChat();
        $chatInput.focus();
        return;
      }

      if ($chatInput.value.trim() !== "") {
        sendChat($chatInput.value);
      }

      closeChat();
      $chatInput.blur();
    }
  });
}

export function openEmojiPicker() {
  const pickerOptions = {
    onEmojiSelect: (emoji) => {
      document.querySelector("em-emoji-picker").remove();

      if (!chatIsOpen()) {
        openChat();
      }

      if (!$chatInput.value.endsWith(" ")) $chatInput.value += " ";
      $chatInput.value += EMOJI_SHORTCODES.hasOwnProperty(emoji.shortcodes)
        ? emoji.shortcodes
        : emoji.native;
      $chatInput.selectionStart = $chatInput.value.length;

      $chatInput.focus();
    },
    theme: "dark",
    autoFocus: true,
    emojiButtonSize: 32,
    showPreview: false,
    set: "twitter",
    onClickOutside: () => {
      document.querySelector("em-emoji-picker").remove();
    },
  };
  const picker = new EmojiMart.Picker(pickerOptions);

  document.body.appendChild(picker);
  picker.style.bottom =
    innerHeight +
    $emojiButton.offsetHeight +
    5 -
    $emojiButton.getBoundingClientRect().bottom +
    "px";
}

export function openChat() {
  $chat.classList.add("open");
}

export function closeChat() {
  $chat.classList.remove("open");
}

export function appendChat(msgId, username, message, color, uuid = null) {
  const $msg = document.createElement("div");
  const $name = document.createElement("span");

  const urlRegex =
    /(https?):\/\/(localhost|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+)(:\d+)?(\/[^\s]*)?/gi;

  $msg.className = "message";
  $msg.id = "msg_" + msgId;

  msgContent.set(msgId, message);

  const parts = [];
  let lastIndex = 0;

  message.replace(urlRegex, (match, _p1, _p2, _p3, _p4, offset) => {
    if (offset > lastIndex) {
      parts.push({ text: message.slice(lastIndex, offset), isLink: false });
    }
    parts.push({
      text: match,
      isLink: true,
      domain: _p2.replace(/www\./g, ""),
    });
    lastIndex = offset + match.length;
  });

  if (lastIndex < message.length) {
    parts.push({ text: message.slice(lastIndex), isLink: false });
  }

  for (const part of parts) {
    if (part.isLink) {
      const a = document.createElement("a");
      a.href = part.text;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = part.text;

      a.addEventListener("click", (e) => {
        e.preventDefault();

        const trusted = JSON.parse(
          localStorage.getItem("trustedDomains") || "[]",
        );

        if (trusted.includes(part.domain)) {
          window.open(a.href, "_blank", "noopener");
          return;
        }

        Swal.fire({
          color: "#cecece",
          title: "External Link",
          text: "You're opening " + part.domain + " in a new tab.",
          footer:
            "<small style='color: #888'>Click 'Trust Domain' to allow this domain in the future.</small>",
          icon: "warning",
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: "Continue",
          denyButtonText: "Trust Domain",
          customClass: {
            denyButton: "swal-trust-btn",
          },
          reverseButtons: true,
          heightAuto: false,
          width: 600,
        }).then((result) => {
          if (result.isConfirmed) {
            window.open(a.href, "_blank", "noopener");
          } else if (result.isDenied) {
            trusted.push(part.domain);
            localStorage.setItem(
              "trustedDomains",
              JSON.stringify([...new Set(trusted)]),
            );
            window.open(a.href, "_blank", "noopener");
          }
        });
      });

      $msg.appendChild(a);
    } else {
      const span = document.createElement("span");

      // emojis
      part.text = part.text.replace(
        /:([^:\s]+):/g,
        (match) => EMOJI_SHORTCODES[match] || match,
      );

      // filter
      if (getCurrentRoom().settings.chatFilter) {
        const badWordPatterns = BAD_WORDS.map((word) => leetPattern(word)).join(
          "|",
        );

        const regex = new RegExp(`(${badWordPatterns})`, "gi");
        const normalizedText = normalizeHomoglyphs(part.text);

        if (normalizedText.match(regex)) {
          part.text = normalizedText.replace(regex, function (match) {
            return "*".repeat(match.length);
          });
        }
      }

      span.textContent = part.text;
      $msg.appendChild(span);

      twemoji.parse(span, {
        base: "emojis/",
        ext: ".svg",
        size: "32x32",
      });
    }
  }

  $name.className = "name";
  $name.style.color = color || "cyan";
  $name.textContent = username + ": ";
  $name.dataset.uuid = uuid || "";

  $name.addEventListener("click", () => {
    Swal.fire({
      heightAuto: false,
      color: "#cecece",
      width: 600,
      titleText: "UUID of " + $name.textContent,
      html: uuid
        ? '<code style="font-size:.8rem;background:#333;padding:3px">' +
          uuid +
          "</code>"
        : "(none)",
    });
  });

  $msg.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    if (!chatIsOpen()) openChat();

    const x = e.pageX;
    const y = e.pageY;

    document.querySelectorAll(".message").forEach(($msg) => {
      $msg.classList.remove("context-menu-open");
    });

    $copyAuthorUid.style.display = uuid ? "block" : "none";
    $copyMsgId.style.display = msgId ? "block" : "none";
    $deleteMsg.style.display = msgId && uuid ? "none" : "block";

    $msgCtxMenu.style.display = "block";
    $msgCtxMenu.dataset.msgId = msgId;
    $msgCtxMenu.dataset.authorUid = uuid || "";
    $msg.classList.add("context-menu-open");

    $msgCtxMenu.style.left = x + "px";
    if (y >= innerHeight / 2)
      $msgCtxMenu.style.top = y - $msgCtxMenu.offsetHeight + "px";
    else $msgCtxMenu.style.top = y + "px";
  });

  $msg.prepend($name);
  $messages.appendChild($msg);

  $messages.scrollTop = $messages.scrollHeight;

  const showMax = 100;
  const allMessages = $messages.querySelectorAll(".message");

  if (allMessages.length > showMax / 10) {
    allMessages.forEach((msg, index) => {
      const opacity = Math.max(
        0,
        1 - (allMessages.length - index - 1) / showMax,
      );
      if (opacity <= 0) {
        msg.remove();
        return;
      }
      msg.style.opacity = opacity;
    });
  }

  return $msg;
}

export function appendChatTemp(duration, username, message, color) {
  let $msg = appendChat(null, username, message, color);
  setTimeout(() => {
    $msg.remove();
  }, duration);
}

export function sendChat(message) {
  $chatInput.value = "";
  $chatInput.blur();

  if (!message || message.trim() === "" || message.length > 200) return;

  send(new Uint8Array([8, ...new TextEncoder().encode(message)]));
}
