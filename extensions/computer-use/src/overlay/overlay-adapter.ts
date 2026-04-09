export type OverlayAdapter = {
  show(): Promise<void>;
  hide(): Promise<void>;
};
