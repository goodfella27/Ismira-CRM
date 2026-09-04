import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};
export const contentType = "image/png";

export default function Icon() {
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
            "linear-gradient(135deg, #2dd4bf 0%, #6366f1 52%, #fb7185 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 284,
            height: 284,
            borderRadius: 78,
            background: "rgba(255,255,255,0.92)",
            transform: "rotate(45deg)",
            boxShadow: "0 30px 90px rgba(15,23,42,0.28)",
          }}
        >
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 32,
              background:
                "linear-gradient(135deg, #14b8a6 0%, #4f46e5 60%, #f97316 100%)",
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
