<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { 
        promptSettings, 
        AVAILABLE_FIELDS, 
        PRESETS,
        generateSystemPrompt,
        type PromptSettings 
    } from '$lib/promptSettings';
    
    export let isOpen = false;
    
    const dispatch = createEventDispatcher();
    
    let localSettings: PromptSettings = promptSettings.getCurrent();

    // When modal opens, refresh local copy from store
    $: if (isOpen) {
        localSettings = promptSettings.getCurrent();
    }
    
    function handlePresetChange(presetId: string) {
        const preset = PRESETS.find(p => p.id === presetId);
        if (!preset) return;
        localSettings = {
            ...localSettings,
            activePresetId: presetId,
            enabledFields: [...preset.enabledFields],
            customSystemPrompt: preset.systemPrompt
        };
        dispatch('change');
    }
    
    function handleFieldToggle(fieldKey: string) {
        const fields = localSettings.enabledFields.includes(fieldKey)
            ? localSettings.enabledFields.filter(f => f !== fieldKey)
            : [...localSettings.enabledFields, fieldKey];

        localSettings = {
            ...localSettings,
            activePresetId: 'custom',
            enabledFields: fields
        };
        dispatch('change');
    }
    
    function handleReset() {
        const base = PRESETS.find(p => p.id === 'basic')!;
        localSettings = {
            activePresetId: base.id,
            enabledFields: [...base.enabledFields],
            customSystemPrompt: base.systemPrompt
        };
        dispatch('change');
    }
    
    function handleClose() {
        isOpen = false;
        dispatch('close');
    }
    
    function handleApply() {
        // Guard: restore defaults if all fields are unchecked
        if (localSettings.enabledFields.length === 0) {
            const defaultFields = AVAILABLE_FIELDS
                .filter(f => f.defaultEnabled)
                .map(f => f.key);
            localSettings = {
                ...localSettings,
                enabledFields: defaultFields,
                activePresetId: 'basic'
            };
        }
        
        // commit localSettings to store
        if (promptSettings && typeof promptSettings.setSettings === 'function') {
            promptSettings.setSettings(localSettings);
        }
        dispatch('apply');
        handleClose();
    }
</script>

{#if isOpen}
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<div class="settings-overlay" on:click={handleClose} role="presentation">
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
    <div class="settings-panel" on:click|stopPropagation role="dialog" aria-modal="true">
        <header class="settings-header">
            <h2>⚙️ Analysis Settings</h2>
            <button class="close-btn" on:click={handleClose} aria-label="Close">×</button>
        </header>
        
        <div class="settings-content">
            <!-- Presets -->
            <section class="settings-section">
                <h3>Preset</h3>
                <div class="preset-list">
                    {#each PRESETS as preset}
                        <button 
                            class="preset-btn"
                            class:active={localSettings.activePresetId === preset.id}
                            on:click={() => handlePresetChange(preset.id)}
                        >
                            <span class="preset-name">{preset.name}</span>
                            <span class="preset-desc">{preset.description}</span>
                        </button>
                    {/each}
                </div>
            </section>
            
            <!-- Output Fields -->
            <section class="settings-section">
                <h3>Output Fields</h3>
                <div class="field-grid">
                    {#each AVAILABLE_FIELDS as field}
                        <label class="field-checkbox">
                            <input 
                                type="checkbox"
                                checked={localSettings.enabledFields.includes(field.key)}
                                on:change={() => handleFieldToggle(field.key)}
                            />
                            <span class="field-label">{field.label}</span>
                            <span class="field-hint">{field.description}</span>
                        </label>
                    {/each}
                </div>
            </section>
            
            <!-- Generated Preview -->
            <section class="settings-section preview-section">
                <h3>Generated Prompt Preview</h3>
                <pre class="prompt-preview">{generateSystemPrompt(localSettings)}</pre>
            </section>
        </div>
        
        <footer class="settings-footer">
            <button class="btn btn-secondary" on:click={handleReset}>
                Reset to Default
            </button>
            <button class="btn btn-primary" on:click={handleApply}>
                Apply
            </button>
        </footer>
    </div>
</div>
{/if}

<style>
    .settings-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .settings-panel {
        background: var(--bg-secondary, #1a1a2e);
        border: 1px solid var(--border-color, #333);
        border-radius: 12px;
        width: 90%;
        max-width: 600px;
        max-height: 85vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    
    .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color, #333);
    }
    
    .settings-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary, #fff);
    }
    
    .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        color: var(--text-secondary, #888);
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }
    
    .close-btn:hover {
        color: var(--text-primary, #fff);
    }
    
    .settings-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
    }
    
    .settings-section {
        margin-bottom: 24px;
    }
    
    .settings-section h3 {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-secondary, #888);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 12px 0;
    }
    
    /* Presets */
    .preset-list {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }
    
    .preset-btn {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding: 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
    }
    
    .preset-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    
    .preset-btn.active {
        background: rgba(171, 104, 255, 0.2);
        border-color: var(--light-purple, #ab68ff);
    }
    
    .preset-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary, #fff);
    }
    
    .preset-desc {
        font-size: 11px;
        color: var(--text-secondary, #888);
        margin-top: 4px;
    }
    
    /* Fields */
    .field-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }
    
    .field-checkbox {
        display: flex;
        flex-direction: column;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .field-checkbox:hover {
        background: rgba(255, 255, 255, 0.06);
    }
    
    .field-checkbox input {
        display: none;
    }
    
    .field-checkbox input:checked + .field-label {
        color: var(--light-purple, #ab68ff);
    }
    
    .field-checkbox input:checked ~ .field-hint {
        color: rgba(171, 104, 255, 0.7);
    }
    
    .field-checkbox:has(input:checked) {
        background: rgba(171, 104, 255, 0.1);
        border-color: rgba(171, 104, 255, 0.3);
    }
    
    .field-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary, #fff);
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    .field-label::before {
        content: '☐';
        font-size: 14px;
    }
    
    .field-checkbox input:checked + .field-label::before {
        content: '☑';
    }
    
    .field-hint {
        font-size: 10px;
        color: var(--text-secondary, #666);
        margin-top: 2px;
        margin-left: 20px;
    }
    
    /* Preview */
    .preview-section {
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 16px;
    }
    
    .prompt-preview {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 12px;
        font-family: monospace;
        font-size: 11px;
        color: var(--text-secondary, #aaa);
        white-space: pre-wrap;
        margin: 0;
        max-height: 120px;
        overflow-y: auto;
    }
    
    /* Footer */
    .settings-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px 20px;
        border-top: 1px solid var(--border-color, #333);
    }
    
    .btn {
        padding: 10px 20px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: var(--text-primary, #fff);
    }
    
    .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.15);
    }
    
    .btn-primary {
        background: linear-gradient(135deg, #ab68ff 0%, #ff9500 100%);
        border: none;
        color: white;
    }
    
    .btn-primary:hover {
        transform: scale(1.02);
        box-shadow: 0 4px 16px rgba(171, 104, 255, 0.3);
    }
    
    @media (max-width: 600px) {
        .preset-list,
        .field-grid {
            grid-template-columns: 1fr;
        }
        
        .settings-panel {
            width: 95%;
            max-height: 90vh;
        }
    }
</style>
