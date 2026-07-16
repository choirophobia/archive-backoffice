import { createContext, useContext, useMemo, useState } from 'react';

// Search + filter state is shared app-wide so the Statistics page can reuse
// whatever the user has set up on the Data page ("Filtered only" mode).
const FiltersContext = createContext(null);

export function FiltersProvider({ children }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState([]);

  // Only fully filled-in filter rows count toward API queries.
  const activeFilters = useMemo(
    () => filters.filter((f) => f.field && f.operator && String(f.value).trim() !== ''),
    [filters]
  );

  const value = useMemo(
    () => ({ search, setSearch, filters, setFilters, activeFilters }),
    [search, filters, activeFilters]
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) {
    throw new Error('useFilters must be used within a FiltersProvider');
  }
  return ctx;
}
