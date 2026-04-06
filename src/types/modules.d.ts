declare module 'arabic-reshaper' {
  const arabicReshaper: {
    convertArabic: (text: string) => string;
  };
  export default arabicReshaper;
}

declare module 'bidi-js' {
  export default function Bidi(): {
    getReorderedString: (text: string, direction: 'rtl' | 'ltr') => string;
  };
}
