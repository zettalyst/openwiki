/**
 * Removes HTML tags from a string and returns the remaining plain text.
 *
 * Well-formed tags are removed by stripping `<...>` spans repeatedly until the
 * string stops changing. Any leftover angle brackets are then removed individually,
 * so neither a complete nor a partial tag can survive.
 */
export declare function stripHtmlTags(input: string): string;
