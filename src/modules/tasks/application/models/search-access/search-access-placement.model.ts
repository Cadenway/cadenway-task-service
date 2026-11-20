/** Current identity and placement of an active Search candidate, without display data. */
export type SearchAccessPlacement =
  | {
      readonly kind: 'task';
      readonly id: string;
      readonly version: number;
      readonly listId: string;
      readonly spaceId: string;
    }
  | {
      readonly kind: 'list';
      readonly id: string;
      readonly version: number;
      readonly spaceId: string;
    }
  | {
      readonly kind: 'space';
      readonly id: string;
      readonly version: number;
    };
