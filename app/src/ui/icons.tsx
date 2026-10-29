const PATHS = {
  brand: <><circle cx="4" cy="5" r="2.2" /><circle cx="14" cy="4" r="1.8" /><circle cx="10" cy="14" r="2.6" /><path d="M6 6.2 8.8 11.7M12.6 5.3l-1.6 6.2M6.2 4.7l6-.5" /></>,
  notes: <><rect x="3" y="2.5" width="10" height="11" rx="1.5" /><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" /></>,
  plus: <path d="M8 3v10M3 8h10" />,
  search: <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></>,
  link: <><circle cx="3.5" cy="8" r="2" /><circle cx="12.5" cy="3.8" r="1.8" /><circle cx="12.5" cy="12.2" r="1.8" /><path d="M5.3 7 10.8 4.6M5.3 9l5.5 2.4" /></>,
  star: <path d="m8 2.5 1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.2 4.6 13l.7-3.8-2.8-2.7 3.8-.5z" />,
  clock: <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.5" /></>,
  theme: <><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor" /></>,
  rail: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M10 3v10" /></>,
  back: <path d="M10 3 5 8l5 5" />,
  menu: <path d="M3 4.5h10M3 8h10M3 11.5h10" />,
}

export type IconName = keyof typeof PATHS

export const Icon = ({name}: {name: IconName}) => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    {PATHS[name]}
  </svg>
)
