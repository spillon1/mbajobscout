import { Link } from 'react-router-dom';
import { Zap, MapPin, Loader2, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UK_CITIES } from '@/data/ukLocations';
import { useAuth } from '@/hooks/useAuth';

const TABS = [
  { path: '/', label: 'VC' },
  { path: '/pe', label: 'PE' },
  { path: '/ib', label: 'IB' },
  { path: '/mc', label: 'MC' },
  { path: '/st', label: 'S&T' },
  { path: '/im', label: 'IM' },
  { path: '/tech', label: 'Tech' },
  { path: '/startups', label: 'Startups' },
];

interface NavBarProps {
  activeTab: string; // path like '/' or '/pe'
  selectedCity: string;
  onCityChange: (city: string) => void;
  isSearching: boolean;
  onSearch: () => void;
  onStop: () => void;
  onSignInClick: () => void;
}

export function NavBar({ activeTab, selectedCity, onCityChange, isSearching, onSearch, onStop, onSignInClick }: NavBarProps) {
  const { user, signOut } = useAuth();

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container max-w-6xl mx-auto px-4 py-3">
        {/* Top row: logo + tabs + user */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-sm bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div className="hidden sm:block shrink-0">
              <h1 className="font-display text-sm font-bold tracking-tight text-foreground">
                MBA<span className="text-primary">JOBSCOUT</span>
              </h1>
              <p className="text-[10px] font-display text-muted-foreground uppercase tracking-widest">
                UK JOB AGGREGATOR
              </p>
            </div>
            <nav className="flex items-center gap-0.5 ml-2 sm:ml-4 overflow-x-auto scrollbar-hide">
              {TABS.map((tab) => (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-display uppercase tracking-wider whitespace-nowrap transition-colors ${
                    activeTab === tab.path
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Desktop: location + search + user inline */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <Select value={selectedCity} onValueChange={onCityChange}>
                <SelectTrigger className="h-7 w-[140px] text-xs font-display bg-card border-border">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {UK_CITIES.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value} className="text-xs">
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={isSearching ? onStop : onSearch}
              size="sm"
              variant="default"
              className="font-display text-[10px] uppercase tracking-wider h-7 px-6"
            >
              {isSearching ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Scraping
                </span>
              ) : (
                'Find Jobs'
              )}
            </Button>

            {user ? (
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-display text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{user.email?.split('@')[0]}</span>
              </button>
            ) : (
              <button
                onClick={onSignInClick}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-display uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border"
              >
                <User className="h-3.5 w-3.5" />
                <span>Sign in</span>
              </button>
            )}
          </div>

          {/* Mobile: only user icon */}
          <div className="flex sm:hidden items-center">
            {user ? (
              <button
                onClick={signOut}
                className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={onSignInClick}
                className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border"
              >
                <User className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile: location + search row below */}
        <div className="flex sm:hidden items-center gap-2 mt-2 pt-2 border-t border-border">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <Select value={selectedCity} onValueChange={onCityChange}>
            <SelectTrigger className="h-7 flex-1 text-xs font-display bg-card border-border">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              {UK_CITIES.map((loc) => (
                <SelectItem key={loc.value} value={loc.value} className="text-xs">
                  {loc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={isSearching ? onStop : onSearch}
            size="sm"
            variant="default"
            className="font-display text-[10px] uppercase tracking-wider h-7 px-4 shrink-0"
          >
            {isSearching ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Scraping
              </span>
            ) : (
              'Find Jobs'
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
