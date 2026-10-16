import React, { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import { UploadSimple, FileText } from "@phosphor-icons/react";
import "./dropzone.css";

export interface DropzoneProps extends React.HTMLAttributes<HTMLDivElement> {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSizeMb?: number;
  disabled?: boolean;
  title?: string;
  draggingTitle?: string;
  subtitle?: string;
  formats?: string[];
  actionText?: string;
}

export const Dropzone = React.forwardRef<HTMLDivElement, DropzoneProps>(
  (
    {
      onFileSelect,
      accept = "image/png,image/jpeg,image/webp,application/pdf",
      maxSizeMb = 15,
      disabled = false,
      title = "Drag and drop your prescription",
      draggingTitle = "Drop your prescription file here",
      subtitle = "Clear, high-contrast photos or clinical documents",
      formats = ["PNG", "JPG", "WEBP", "PDF"],
      actionText = "Browse File",
      className = "",
      ...props
    },
    ref
  ) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (disabled) return;
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const file = e.dataTransfer.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    };

    const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
      e.target.value = "";
    };

    const handleTriggerClick = () => {
      if (disabled) return;
      fileInputRef.current?.click();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };

    return (
      <div
        ref={ref}
        className={`cb-dropzone ${isDragging ? "dragging" : ""} ${disabled ? "disabled" : ""} ${className}`.trim()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload prescription file dropzone"
        {...props}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileInputChange}
          disabled={disabled}
          className="cb-dropzone-input"
          aria-hidden="true"
          tabIndex={-1}
        />

        <div className="cb-dropzone-icon-box">
          <UploadSimple size={24} weight="bold" className="cb-dropzone-icon" />
        </div>

        <div className="cb-dropzone-content">
          <h3 className="cb-dropzone-title">
            {isDragging ? draggingTitle : title}
          </h3>
          <p className="cb-dropzone-subtitle">{subtitle}</p>

          <div className="cb-dropzone-meta">
            <div className="cb-dropzone-formats">
              {formats.map((fmt) => (
                <span key={fmt} className="cb-dropzone-badge">
                  {fmt}
                </span>
              ))}
            </div>
            <span className="cb-dropzone-limit">Up to {maxSizeMb}MB</span>
          </div>
        </div>

        <button
          type="button"
          className="cb-dropzone-button"
          onClick={(e) => {
            e.stopPropagation();
            handleTriggerClick();
          }}
          disabled={disabled}
          tabIndex={-1}
        >
          <FileText size={16} weight="bold" />
          <span>{actionText}</span>
        </button>
      </div>
    );
  }
);
Dropzone.displayName = "Dropzone";
