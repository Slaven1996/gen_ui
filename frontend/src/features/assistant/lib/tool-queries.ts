/** A list call as its page's query: every field but the title. */
export const withoutTitle = <T extends { title: string }>({ title: _title, ...filters }: T) => filters;
