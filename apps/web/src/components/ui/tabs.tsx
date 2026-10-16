import React, { createContext, useContext, useId } from "react";
import "./tabs.css";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ value, onValueChange, className = "", children, ...props }, ref) => {
    const baseId = useId();
    return (
      <TabsContext.Provider value={{ value, onValueChange, baseId }}>
        <div ref={ref} className={`cb-tabs ${className}`.trim()} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = "Tabs";

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="tablist"
        className={`cb-tabs-list ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsList.displayName = "TabsList";

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  children: React.ReactNode;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, className = "", children, disabled, onClick, onKeyDown, ...props }, ref) => {
    const context = useContext(TabsContext);
    if (!context) {
      throw new Error("TabsTrigger must be used within a Tabs component");
    }

    const isSelected = context.value === value;
    const tabId = `${context.baseId}-tab-${value}`;
    const panelId = `${context.baseId}-panel-${value}`;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      onClick?.(e);
      if (!e.defaultPrevented) {
        context.onValueChange(value);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      const currentTarget = e.currentTarget;
      const list = currentTarget.closest('[role="tablist"]');
      if (!list) return;

      const tabs = Array.from(
        list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')
      );
      const index = tabs.indexOf(currentTarget);

      let targetTab: HTMLButtonElement | undefined;
      if (e.key === "ArrowRight") {
        targetTab = tabs[(index + 1) % tabs.length];
      } else if (e.key === "ArrowLeft") {
        targetTab = tabs[(index - 1 + tabs.length) % tabs.length];
      } else if (e.key === "Home") {
        targetTab = tabs[0];
      } else if (e.key === "End") {
        targetTab = tabs[tabs.length - 1];
      }

      if (targetTab) {
        e.preventDefault();
        targetTab.focus();
        targetTab.click();
      }
    };

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        id={tabId}
        aria-selected={isSelected}
        aria-controls={panelId}
        tabIndex={isSelected ? 0 : -1}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`cb-tabs-trigger ${isSelected ? "active" : ""} ${className}`.trim()}
        {...props}
      >
        {children}
      </button>
    );
  }
);
TabsTrigger.displayName = "TabsTrigger";

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, className = "", children, ...props }, ref) => {
    const context = useContext(TabsContext);
    if (!context) {
      throw new Error("TabsContent must be used within a Tabs component");
    }

    const isSelected = context.value === value;
    const tabId = `${context.baseId}-tab-${value}`;
    const panelId = `${context.baseId}-panel-${value}`;

    if (!isSelected) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId}
        tabIndex={0}
        className={`cb-tabs-content ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsContent.displayName = "TabsContent";
