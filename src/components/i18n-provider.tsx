"use client";

import { createContext, useContext } from "react";
import { dictionaries, type Dict, type Lang } from "@/lib/i18n";

const I18nContext = createContext<{ lang: Lang; t: Dict }>({
  lang: "en",
  t: dictionaries.en,
});

export function I18nProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ lang, t: dictionaries[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
