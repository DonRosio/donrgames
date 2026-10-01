/** A question as written in the theme files. */
export interface RawQuestion {
  /** The sentence, with exactly one blank (`______`) where the answer goes. */
  text: string;
  /** The real answer, as shown when it is revealed. */
  answer: string;
  /** Other ways to write it, refused as false answers (typos of `answer` are refused anyway). */
  accept: string[];
}
