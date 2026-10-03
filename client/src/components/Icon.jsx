const paths = {
  lines: ['M5 6h14', 'M5 12h10', 'M5 18h6'],
  sparkle: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z'],
  link: [
    'M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-2 2',
    'M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l2-2',
  ],
  arrow: ['M5 12h14', 'm13 6 6 6-6 6'],
  library: ['M4 4v16', 'M9 4v16', 'm14 4 5 15'],
  plus: ['M12 5v14', 'M5 12h14'],
  search: ['M21 21l-5-5'],
  external: ['M14 3h7v7', 'm10 14 11-11', 'M21 14v7H3V3h7'],
  copy: ['M9 9h12v12H9z', 'M15 9V3H3v12h6'],
  check: ['m5 12 4 4L19 6'],
  trash: ['M3 6h18', 'M8 6V3h8v3', 'M5 6l1 15h12l1-15', 'M10 10v7', 'M14 10v7'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 16v5h16v-5'],
  clock: ['M12 7v5l3 2'],
  close: ['m6 6 12 12', 'm18 6-12 12'],
  globe: ['M3 12h18', 'M12 3c5 5 5 13 0 18-5-5-5-13 0-18'],
  refresh: ['M20 7a9 9 0 1 0 1 8', 'M20 3v5h-5'],
  shield: ['m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z', 'm8 12 3 3 5-6'],
};
export default function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {['search', 'clock', 'globe'].includes(name) && (
        <circle
          cx={name === 'search' ? 10.5 : 12}
          cy={name === 'search' ? 10.5 : 12}
          r={name === 'search' ? 7.5 : 9}
        />
      )}
      {(paths[name] || paths.lines).map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}
