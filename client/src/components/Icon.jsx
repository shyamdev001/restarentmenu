const PATHS = {
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  left: 'M19 12H5M11 6l-6 6 6 6',
  right: 'M5 12h14M13 6l6 6-6 6',
  menu: 'M4 7h16M4 12h16M4 17h10',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.500-3.500',
  heart: 'M12 20s-7-4.400-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.600-7 10-7 10z',
  sliders: 'M4 7h9M19 7h1M4 17h1M11 17h9M16 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 7l3 3',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.500l4.500 4.500L19 7',
  flame: 'M12 3c.500 3 4.500 5 4.500 9.500a4.500 4.500 0 0 1-9 0c0-2 1-3.200 2-4.200.300 1.400 1 2.200 1.800 2.200C11.300 8.500 11 6 12 3z',
  sound: 'M4 10v4h3l5 4V6l-5 4zM16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M2 12h2M20 12h2M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400',
  moon: 'M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.500 2h-15zM10 21h4',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  print: 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z'
};

export default function Icon({ name, size = 18, fill = 'none', strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
