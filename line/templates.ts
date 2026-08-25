// The message the owner actually sees. Approve / Reject are postback buttons,
// so tapping them hits our webhook instead of sending a chat message.
//
// No Edit button by design: LINE has no inline-edit UI, so editing lives in
// the dashboard. Trying to do it in chat means multi-turn state and a demo
// that breaks on stage.

import { encodePostback } from "./verify";

const MAX_TEXT = 300; // keep the card readable on a phone

function clip(s: string, n = MAX_TEXT): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export function approvalCard(args: {
  approvalId: string;
  roleName: string;
  title: string;
  body: string;
  reason: string;
}) {
  return {
    type: "flex",
    altText: `Approval needed: ${clip(args.title, 60)}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: args.roleName, size: "xs", color: "#8c8c8c" },
          { type: "text", text: clip(args.title, 80), weight: "bold", size: "md", wrap: true },
          { type: "separator", margin: "md" },
          { type: "text", text: clip(args.body), size: "sm", wrap: true, margin: "md" },
          {
            type: "text",
            text: `Why: ${clip(args.reason, 120)}`,
            size: "xs",
            color: "#8c8c8c",
            wrap: true,
            margin: "md",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            action: {
              type: "postback",
              label: "Approve",
              data: encodePostback("approve", args.approvalId),
              displayText: "Approved",
            },
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: "Reject",
              data: encodePostback("reject", args.approvalId),
              displayText: "Rejected",
            },
          },
        ],
      },
    },
  };
}

export function text(t: string) {
  return { type: "text", text: t };
}
