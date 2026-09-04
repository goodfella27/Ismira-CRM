import { ImageResponse } from "next/og";

import { JOBS_PORTAL_SHARE_TITLE } from "@/lib/share-metadata";

export const alt = "Ismira Jobs Portal gradient logo";
export const size = {
  width: 1200,
  height: 1200,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #2dd4bf 0%, #7c3aed 48%, #fb7185 100%)",
          color: "white",
          fontFamily: "Arial, sans-serif",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 22% 18%, rgba(255,255,255,0.38), transparent 28%), radial-gradient(circle at 80% 82%, rgba(252,211,77,0.38), transparent 30%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 92,
            right: 102,
            width: 190,
            height: 190,
            borderRadius: 52,
            border: "3px solid rgba(255,255,255,0.36)",
            transform: "rotate(12deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 100,
            left: 92,
            width: 160,
            height: 160,
            borderRadius: 46,
            background: "rgba(255,255,255,0.16)",
            transform: "rotate(-10deg)",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            width: 870,
            height: 870,
            borderRadius: 186,
            background: "rgba(255,255,255,0.16)",
            boxShadow: "0 50px 160px rgba(15,23,42,0.28)",
            border: "2px solid rgba(255,255,255,0.34)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 680,
              height: 680,
              borderRadius: 150,
              background: "rgba(255,255,255,0.94)",
              color: "#312e81",
              boxShadow: "inset 0 0 0 2px rgba(49,46,129,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 250,
                height: 250,
                borderRadius: 72,
                background:
                  "linear-gradient(135deg, #14b8a6 0%, #4f46e5 58%, #f97316 100%)",
                transform: "rotate(45deg)",
                marginBottom: 70,
              }}
            >
              <div
                style={{
                  width: 112,
                  height: 112,
                  borderRadius: 34,
                  background: "rgba(255,255,255,0.92)",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 92,
                fontWeight: 800,
                letterSpacing: 0,
                lineHeight: 1,
                color: "#312e81",
              }}
            >
              Ismira
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 22,
                fontSize: 54,
                fontWeight: 700,
                letterSpacing: 0,
                lineHeight: 1.05,
                color: "#0f766e",
              }}
            >
              Jobs Portal
            </div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 58,
            display: "flex",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: 0,
            color: "rgba(255,255,255,0.86)",
          }}
        >
          {JOBS_PORTAL_SHARE_TITLE}
        </div>
      </div>
    ),
    size
  );
}
