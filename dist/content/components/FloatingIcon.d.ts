export declare class FloatingIcon {
    private iconElement;
    private toggleCallback;
    private isDragging;
    private dragOffset;
    create(): void;
    private setStyles;
    private addEventListeners;
    private handleMouseMove;
    private handleMouseUp;
    onToggle(callback: () => void): void;
    updateState(isActive: boolean): void;
    remove(): void;
}
//# sourceMappingURL=FloatingIcon.d.ts.map