import type { DetailedHTMLProps, HTMLAttributes } from "react";

type LinasJobsBoardProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  "api-base"?: string;
  apiBase?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "linas-jobs-board": LinasJobsBoardProps;
    }
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "linas-jobs-board": LinasJobsBoardProps;
    }
  }
}

export {};
