/**
 * Prompt Settings Store
 * Manages user-configurable prompt settings with localStorage persistence
 */
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

// Available output fields
export interface OutputField {
    key: string;
    label: string;
    description: string;
    enumValues?: string[];
    defaultEnabled: boolean;
}

export const AVAILABLE_FIELDS: OutputField[] = [
    { 
        key: 'age', 
        label: 'Age', 
        description: 'Estimated age range',
        enumValues: ['child', 'teen', '20s', '30s', '40s', '50s', '60s+'],
        defaultEnabled: true 
    },
    { 
        key: 'sex', 
        label: 'Sex', 
        description: 'Biological sex',
        enumValues: ['male', 'female'],
        defaultEnabled: true 
    },
    { 
        key: 'fashion', 
        label: 'Fashion', 
        description: 'Brief clothing description (3 words max)',
        defaultEnabled: true 
    },
    { 
        key: 'emotion', 
        label: 'Emotion', 
        description: 'Facial expression / emotion',
        enumValues: ['happy', 'neutral', 'focused', 'sad', 'angry', 'surprised'],
        defaultEnabled: false 
    },
    { 
        key: 'action', 
        label: 'Action', 
        description: 'Current activity',
        enumValues: ['standing', 'walking', 'sitting', 'running', 'talking', 'using_phone'],
        defaultEnabled: false 
    },
    { 
        key: 'direction', 
        label: 'Direction', 
        description: 'Body orientation',
        enumValues: ['front', 'left', 'right', 'back'],
        defaultEnabled: false 
    },
    { 
        key: 'accessories', 
        label: 'Accessories', 
        description: 'Visible accessories',
        enumValues: ['glasses', 'hat', 'bag', 'mask', 'headphones', 'none'],
        defaultEnabled: false 
    },
    { 
        key: 'posture', 
        label: 'Posture', 
        description: 'Body posture',
        enumValues: ['upright', 'slouched', 'leaning', 'crouched'],
        defaultEnabled: false 
    }
];

// Preset configurations
export interface Preset {
    id: string;
    name: string;
    description: string;
    enabledFields: string[];
    systemPrompt: string;
}

export const PRESETS: Preset[] = [
    {
        id: 'basic',
        name: 'Basic',
        description: 'Default analysis with age, sex, and fashion',
        enabledFields: ['age', 'sex', 'fashion'],
        systemPrompt: `Analyze each person. Use the exact UID provided.
age: child/teen/20s/30s/40s/50s/60s+
sex: male/female
fashion: brief clothing description (3 words max)`
    },
    {
        id: 'retail',
        name: 'Retail',
        description: 'For retail store analysis with emotion and action',
        enabledFields: ['age', 'sex', 'fashion', 'emotion', 'action'],
        systemPrompt: `Analyze each person for retail analytics. Use the exact UID provided.
age: child/teen/20s/30s/40s/50s/60s+
sex: male/female
fashion: brief clothing description (3 words max)
emotion: happy/neutral/focused/sad/angry/surprised
action: standing/walking/sitting/running/talking/using_phone`
    },
    {
        id: 'security',
        name: 'Security',
        description: 'Security-focused with direction and accessories',
        enabledFields: ['age', 'sex', 'fashion', 'direction', 'accessories'],
        systemPrompt: `Analyze each person for security monitoring. Use the exact UID provided.
age: child/teen/20s/30s/40s/50s/60s+
sex: male/female
fashion: brief clothing description (3 words max)
direction: front/left/right/back
accessories: glasses/hat/bag/mask/headphones/none`
    },
    {
        id: 'custom',
        name: 'Custom',
        description: 'User-defined configuration',
        enabledFields: ['age', 'sex', 'fashion'],
        systemPrompt: `Analyze each person. Use the exact UID provided.`
    }
];

// Settings state
export interface PromptSettings {
    activePresetId: string;
    enabledFields: string[];
    customSystemPrompt: string;
}

const STORAGE_KEY = 'nano-parrot-prompt-settings';

function getDefaultSettings(): PromptSettings {
    return {
        activePresetId: 'basic',
        enabledFields: ['age', 'sex', 'fashion'],
        customSystemPrompt: PRESETS[0].systemPrompt
    };
}

function loadSettings(): PromptSettings {
    if (!browser) return getDefaultSettings();
    
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...getDefaultSettings(), ...parsed };
        }
    } catch (e) {
        console.warn('[PromptSettings] Failed to load settings:', e);
    }
    return getDefaultSettings();
}

function saveSettings(settings: PromptSettings) {
    if (!browser) return;
    
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('[PromptSettings] Failed to save settings:', e);
    }
}

// Create the store
function createPromptSettingsStore() {
    const { subscribe, set, update } = writable<PromptSettings>(getDefaultSettings());
    
    // Load from localStorage on init (browser only)
    if (browser) {
        set(loadSettings());
    }
    
    return {
        subscribe,
        
        // Apply a preset
        applyPreset(presetId: string) {
            const preset = PRESETS.find(p => p.id === presetId);
            if (!preset) return;
            
            update(s => {
                const newSettings = {
                    ...s,
                    activePresetId: presetId,
                    enabledFields: [...preset.enabledFields],
                    customSystemPrompt: preset.systemPrompt
                };
                saveSettings(newSettings);
                return newSettings;
            });
        },
        
        // Toggle a field
        toggleField(fieldKey: string) {
            update(s => {
                const fields = s.enabledFields.includes(fieldKey)
                    ? s.enabledFields.filter(f => f !== fieldKey)
                    : [...s.enabledFields, fieldKey];
                
                const newSettings = {
                    ...s,
                    activePresetId: 'custom', // Switch to custom when manually changing
                    enabledFields: fields
                };
                saveSettings(newSettings);
                return newSettings;
            });
        },
        
        // Update custom system prompt
        setCustomPrompt(prompt: string) {
            update(s => {
                const newSettings = {
                    ...s,
                    activePresetId: 'custom',
                    customSystemPrompt: prompt
                };
                saveSettings(newSettings);
                return newSettings;
            });
        },
        
        // Reset to defaults
        reset() {
            const defaults = getDefaultSettings();
            set(defaults);
            saveSettings(defaults);
        },
        
        // Replace entire settings (useful for batched apply from UI)
        setSettings(settings: PromptSettings) {
            set(settings);
            saveSettings(settings);
        },
        
        // Get current settings (for use outside reactive context)
        getCurrent(): PromptSettings {
            return get({ subscribe });
        }
    };
}

export const promptSettings = createPromptSettingsStore();

/**
 * Generate system prompt based on current settings
 */
export function generateSystemPrompt(settings: PromptSettings): string {
    if (settings.activePresetId !== 'custom') {
        const preset = PRESETS.find(p => p.id === settings.activePresetId);
        if (preset) return preset.systemPrompt;
    }
    
    // Build dynamic prompt for custom settings
    const lines = ['Analyze each person. Use the exact UID provided.'];
    
    for (const fieldKey of settings.enabledFields) {
        const field = AVAILABLE_FIELDS.find(f => f.key === fieldKey);
        if (!field) continue;
        
        if (field.enumValues) {
            lines.push(`${field.key}: ${field.enumValues.join('/')}`);
        } else {
            lines.push(`${field.key}: ${field.description}`);
        }
    }
    
    return lines.join('\n');
}

/**
 * Generate JSON schema based on enabled fields
 */
export function generateResponseSchema(settings: PromptSettings): object {
    const properties: Record<string, any> = {
        uid: { type: 'string' }
    };
    
    const required = ['uid'];
    
    for (const fieldKey of settings.enabledFields) {
        const field = AVAILABLE_FIELDS.find(f => f.key === fieldKey);
        if (!field) continue;
        
        if (field.enumValues) {
            properties[fieldKey] = {
                type: 'string',
                enum: field.enumValues
            };
        } else {
            properties[fieldKey] = { type: 'string' };
        }
        required.push(fieldKey);
    }
    
    return {
        type: 'array',
        items: {
            type: 'object',
            properties,
            required
        }
    };
}
