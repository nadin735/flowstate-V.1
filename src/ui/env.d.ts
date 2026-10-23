declare module "*.css" {
  const content: string;
  export default content;
}

/** true in the hosted-preview build, where the host blocks printing and file downloads. */
declare const __RESTRICTED_HOST__: boolean;
/** Demo build: opens directly with the fictional test-data project. */
declare const __DEMO__: boolean;

declare module "*.pdf" {
  const bytes: Uint8Array;
  export default bytes;
}
