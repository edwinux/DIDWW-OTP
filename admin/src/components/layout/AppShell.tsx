import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ScrollArea } from '@/components/ui/scroll-area';

export function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar onMobileMenuOpen={() => setMobileMenuOpen(true)} />

        {/* Page Content */}
        <ScrollArea className="flex-1">
          <main className="p-4 md:p-6">
            <Outlet />
          </main>
        </ScrollArea>
      </div>
    </div>
  );
}
