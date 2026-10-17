import React, { useState, useRef, useEffect, useId } from "react";
import {
  Translate,
  CaretDown,
  Check,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  SUPPORTED_LANGUAGES,
  getLanguageOption,
  type LanguageOption,
} from "../types/language";
import "./LanguageSelector.css";

interface LanguageSelectorProps {
  language: string;
  onSelectLanguage: (code: string) => void;
  className?: string;
  id?: string;
  showAiSupportBadge?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  language,
  onSelectLanguage,
  className = "",
  id = "carebridge-language-selector",
  showAiSupportBadge = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const currentOption = getLanguageOption(language);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        setIsOpen(true);
        const idx = SUPPORTED_LANGUAGES.findIndex(
          (l) => l.code === currentOption.code
        );
        setFocusedIndex(idx >= 0 ? idx : 0);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case "ArrowDown": {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % SUPPORTED_LANGUAGES.length);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        setFocusedIndex(
          (prev) => (prev - 1 + SUPPORTED_LANGUAGES.length) % SUPPORTED_LANGUAGES.length
        );
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < SUPPORTED_LANGUAGES.length) {
          handleSelect(SUPPORTED_LANGUAGES[focusedIndex]);
        }
        break;
      }
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  // Keep focused option visible in scroll area
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listboxRef.current) {
      const items = listboxRef.current.querySelectorAll<HTMLLIElement>('[role="option"]');
      if (items[focusedIndex]) {
        items[focusedIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedIndex, isOpen]);

  const handleSelect = (option: LanguageOption) => {
    onSelectLanguage(option.code);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const toggleDropdown = () => {
    if (!isOpen) {
      const idx = SUPPORTED_LANGUAGES.findIndex(
        (l) => l.code === currentOption.code
      );
      setFocusedIndex(idx >= 0 ? idx : 0);
    }
    setIsOpen((prev) => !prev);
  };

  return (
    <div
      ref={containerRef}
      className={`lang-selector-wrapper ${className}`}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`lang-selector-btn ${isOpen ? "open" : ""} ${
          !currentOption.isAiSupported ? "has-unsupported-warning" : ""
        }`}
        onClick={toggleDropdown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={`Select language. Currently selected: ${currentOption.name} (${currentOption.shortCode})`}
        title={`Change Language (Current: ${currentOption.name})`}
      >
        <span className="lang-btn-icon-wrapper" aria-hidden="true">
          <Translate size={15} weight="bold" />
        </span>
        <span className="lang-btn-shortcode" aria-hidden="true">
          {currentOption.shortCode}
        </span>
        <CaretDown
          size={12}
          weight="bold"
          className={`lang-caret-icon ${isOpen ? "rotated" : ""}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className="lang-dropdown-panel"
          role="region"
          aria-label="Language selection options"
        >
          <div className="lang-dropdown-header">
            <span className="lang-dropdown-header-title">Select Language</span>
            <span className="lang-dropdown-count">
              {SUPPORTED_LANGUAGES.length} available
            </span>
          </div>

          <ul
            ref={listboxRef}
            id={listboxId}
            className="lang-options-list"
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={
              focusedIndex >= 0
                ? `lang-opt-${SUPPORTED_LANGUAGES[focusedIndex]?.code}`
                : undefined
            }
          >
            {SUPPORTED_LANGUAGES.map((option, index) => {
              const isSelected =
                option.code.toLowerCase() === currentOption.code.toLowerCase();
              const isFocused = index === focusedIndex;

              return (
                <li
                  key={option.code}
                  id={`lang-opt-${option.code}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`lang-option-item ${isSelected ? "selected" : ""} ${
                    isFocused ? "focused" : ""
                  }`}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  <div className="lang-opt-left">
                    <span className="lang-code-tag">{option.shortCode}</span>
                    <div className="lang-text-group">
                      <span className="lang-name-primary">{option.name}</span>
                      <span className="lang-name-native">{option.nativeName}</span>
                    </div>
                  </div>

                  <div className="lang-opt-right">
                    {showAiSupportBadge && (
                      <span
                        className={`lang-support-badge ${
                          option.isAiSupported ? "ai-ready" : "ai-pending"
                        }`}
                        title={
                          option.isAiSupported
                            ? "Supported by AMD ROCm AI models"
                            : "This language is not currently supported by the AI service."
                        }
                      >
                        {option.isAiSupported ? "AI Ready" : "AI Pending"}
                      </span>
                    )}
                    {isSelected && (
                      <Check
                        size={16}
                        weight="bold"
                        className="lang-selected-check"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {!currentOption.isAiSupported && (
            <div className="lang-dropdown-unsupported-note" role="note">
              <WarningCircle size={14} weight="bold" />
              <span>This language is not currently supported by the AI service.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
