export type { Locale } from './locale';

type DeepString<T> = T extends string ? string : { [K in keyof T]: DeepString<T[K]> };

export type TranslationDict = DeepString<typeof import('./locales/en').en>;
