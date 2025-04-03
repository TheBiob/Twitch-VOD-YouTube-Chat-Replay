class ConfigBuilder {
    /**
     * Handles building configuration pages
     * @param {any} config 
     * @param {func(config, setting)} setting_changed_callback 
     */
    constructor(config, setting_changed_callback) {
        this.config = config;
        this._sections = [];
        this._activeSection = null;
        this._built = false;
        this._setting_changed_callback = setting_changed_callback;

        this.template = {
            section: document.createElement('template'),
            checkbox: document.createElement('template'),
        }
        this.template.checkbox.innerHTML = `
<div class="list-group-item setting">
    <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox">
        <label class="form-check-label"></label>
    </div>
</div>
`;
this.template.section.innerHTML = `
<div class="list-group-item list-group-item-secondary">
    <span class="header"></span>
</div>
`;
    }

    hasChanges() {
        for (let section of this._sections) {
            if (section.hasChanges()) {
                return true;
            }
        }
        return false;
    }

    updateDefaultValues() {
        for (let section of this._sections) {
            section.updateDefaultValues();
        }
    }

    beginSection(name) {
        if (this._built) {
            throw 'Configuration already initialized';
        }
        if (this._activeSection) {
            this._sections.push(this._activeSection);
        }
        this._activeSection = new Section(name, this);
    }
    
    addSetting(name, default_value, path) {
        if (this._built) {
            throw 'Configuration already initialized';
        }
        const setting = new Setting(name, this._getValue(path, default_value), path);
        setting.config = this;
        
        this._activeSection ??= new Section(null, this);
        this._activeSection.addSetting(setting);
    }

    build(element) {
        if (this._built) {
            throw 'Configuration already initialized';
        }
        if (!element) {
            throw 'No element passed';
        }
        this._built = true;

        if (this._activeSection) {
            this._sections.push(this._activeSection);
            this._activeSection = null;
        }

        for (let section of this._sections) {
            section.build(element);
        }
    }

    onSettingChanged(setting) {
        let value = this.config;
        const path_parts = setting.path.split('.');
        for (let i = 0; i < path_parts.length-1; i++) {
            const part = path_parts[i];
            if (value[part] === undefined || value[part] === null) {
                value[part] = {};
            }

            value = value[part];
        }

        const last_part = path_parts[path_parts.length-1];
        value[last_part] = setting.value;

        if (this._setting_changed_callback) {
            this._setting_changed_callback(this, setting);
        }
    }

    _getValue(path, default_value) {
        const path_parts = path.split('.');

        let value = this.config;
        for (let part of path_parts) {
            if (value[part] === undefined || value[part] === null) {
                return default_value;
            }
            value = value[part];
        }

        if (typeof(value) === typeof(default_value)) {
            return value;
        } else {
            return default_value;
        }
    }
}

class Section {
    constructor(name, config) {
        this.name = name;
        this.config = config;
        this.settings = [];
        this.container = null;
    }

    hasChanges() {
        for (let setting of this.settings)  {
            if (setting.hasChanges()) {
                return true;
            }
        }
        return false;
    }

    updateDefaultValues() {
        for (let setting of this.settings)  {
            setting.updateDefaultValue();
        }
    }

    addSetting(setting) {
        if (this.container) {
            throw 'Section already initialized';
        }
        this.settings.push(setting);
    }

    build(element) {
        const container = this.config.template.section.content.cloneNode(true);
        container.querySelector('.header').innerText = this.name;
        element.appendChild(container);

        for (let setting of this.settings) {
            setting.build(element);
        }
        this.container = container;
    }
}

class Setting {
    constructor(name, value, path) {
        this.name = name;
        this.value = value;
        this.default_value = value;
        this.config = null;
        this.id = 'config-'+path;
        this.path = path;
        this.input = null;
        this.type = 'unknown';
        switch (typeof(value)) {
            case 'boolean':
                this.type = 'checkbox';
                break;
            default:
                throw 'Unknown value type ' + typeof(value);
        }
    }

    hasChanges() {
        return this.value !== this.default_value;
    }

    updateDefaultValue() {
        this.default_value = this.value;
    }

    onChange() {
        this.config?.onSettingChanged(this);
    }

    _setValue(elem) {
        switch (this.input.type) {
            case 'checkbox': 
                this.value = elem.checked;
                break;
            default:
                throw 'Cannot set value for type ' + this.input.type;
        }
    }

    build(element) {
        if (this.input !== null) {
            throw 'Already initialized';
        }

        const container = this.config.template[this.type].content.cloneNode(true);
        this.input = container.querySelector('input');
        this.input.id = this.id;
        switch (this.type) {
            case 'checkbox': 
                this.input.checked = this.value;
                break;
            default:
                throw 'Cannot set value for type ' + this.input.type;
        }

        const self = this;
        this.input.addEventListener('change', (e) => {
            self._setValue(e.target);
            self.onChange();
        });

        const label = container.querySelector('label');
        label.innerText = this.name;
        label.htmlFor = this.id;

        element.appendChild(container);
    }
}

module.exports = { ConfigBuilder, Section, Setting };
