/** @odoo-module */

import { Component, onWillUpdateProps, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Property } from "@web_studio/client_action/view_editor/property/property";
import { getWowlFieldWidgets } from "@web_studio/client_action/view_editor/editors/utils";
import {
    EDITABLE_ATTRIBUTES,
    FIELD_TYPE_ATTRIBUTES,
    COMPUTED_DISPLAY_OPTIONS,
} from "./field_type_properties";
import { useService } from "@web/core/utils/hooks";

export class TypeWidgetProperties extends Component {
    static template =
        "web_studio.ViewEditor.InteractiveEditorProperties.Field.TypeWidgetProperties";
    static components = { Property };
    static props = {
        node: { type: Object },
        onChangeAttribute: { type: Function },
    };

    setup() {
        this.rpc = useService("rpc");
        this.attributes = useState({
            field: [],
            selection: [],
            boolean: [],
            domain: [],
            number: [],
            string: [],
        });

        this.attributesForCurrentTypeAndWidget = this.getAttributesForCurrentTypeAndWidget(
            this.props
        );
        this.groupAttributesPerType(this.props);

        onWillUpdateProps((nextProps) => {
            this.attributesForCurrentTypeAndWidget =
                this.getAttributesForCurrentTypeAndWidget(nextProps);
            this.groupAttributesPerType(nextProps);
        });
    }

    groupAttributesPerType(props) {
        this.attributes.field = this.getAttributesOfTypeField(props);
        this.attributes.selection = this.getWidgetAttributes("selection", props);
        this.attributes.boolean = this.getWidgetAttributes("boolean", props);
        this.attributes.domain = this.getWidgetAttributes("domain", props);
        this.attributes.number = this.getWidgetAttributes("number", props);
        this.attributes.string = this.getWidgetAttributes("string", props);
    }

    getAttributesOfTypeField(props) {
        const fieldAttributes = this.getWidgetAttributes("field", props);
        if (fieldAttributes.length) {
            const fields = Object.entries(this.env.viewEditorModel.fields).map(([key, value]) => {
                return {
                    ...value,
                    name: value.name || key,
                };
            });
            fieldAttributes.forEach((attribute) => {
                attribute.choices = this.getFieldChoices(attribute, fields);
            });
            return fieldAttributes;
        }
        return [];
    }

    getSupportedOptions(props) {
        const widgetName = props.node.attrs?.widget || props.node.field.type;
        const fieldRegistry = registry.category("fields").content;
        const widgetDescription =
            fieldRegistry[this.env.viewEditorModel.viewType + "." + widgetName] ||
            fieldRegistry[widgetName];
        return (
            widgetDescription?.[1].supportedOptions?.filter(
                (o) => !o.viewTypes || o.viewTypes.includes(this.env.viewEditorModel.viewType)
            ) || []
        );
    }

    /**
     * @returns the list of available widgets for the current node
     */
    get widgetChoices() {
        const widgets = getWowlFieldWidgets(
            this.props.node.field.type,
            this.props.node.attrs.widget,
            [],
            this.env.debug
        );
        return {
            choices: widgets.map(([value, label]) => {
                label = label ? label : "";
                return {
                    label: `${label} (${value})`.trim(),
                    value,
                };
            }),
        };
    }

    /**
     * @returns the list of attributes available depending the type of field,
     * as well the current widget selected
     */
    _getAttributesForCurrentTypeAndWidget(props) {
        const fieldType = props.node.field.type;
        const { viewType } = this.env.viewEditorModel;

        const fieldCommonViewsProperties = FIELD_TYPE_ATTRIBUTES[fieldType]?.common || [];
        const fieldSpecificViewProperties = FIELD_TYPE_ATTRIBUTES[fieldType]?.[viewType] || [];

        return [
            ...fieldCommonViewsProperties,
            ...fieldSpecificViewProperties,
            ...this.getSupportedOptions(props),
        ];
    }

    getAttributesForCurrentTypeAndWidget(props) {
        const _attributesForCurrentTypeAndWidget =
            this._getAttributesForCurrentTypeAndWidget(props);
        _attributesForCurrentTypeAndWidget.forEach((property) => {
            if (COMPUTED_DISPLAY_OPTIONS[property.name]) {
                const dependentOption = COMPUTED_DISPLAY_OPTIONS[property.name];
                const superOption = _attributesForCurrentTypeAndWidget.find(
                    (o) => o.name === dependentOption.superOption
                );
                property.isSubOption = true;
                if (!superOption.subOptions) {
                    superOption.subOptions = [];
                }
                if (superOption.subOptions.find((o) => o.name === property.name) === undefined) {
                    // only add the subOption if not already present
                    superOption.subOptions.push(property);
                }
            }
        });
        return _attributesForCurrentTypeAndWidget;
    }

    /**
     * @param {string} type of the attribute (eg. "string", "boolean" )
     * @returns only the given type of attributes for the current field node
     */
    getWidgetAttributes(type, props) {
        return this.attributesForCurrentTypeAndWidget
            .filter((attribute) => attribute.type === type)
            .map((attribute) => {
                if (EDITABLE_ATTRIBUTES[attribute.name]) {
                    return this.getPropertyFromAttributes(attribute, props);
                }
                return this.getPropertyFromOptions(attribute, props);
            })
            .filter((attribute) => attribute !== undefined);
    }

    getFieldChoices(attribute, fields) {
        if (attribute.availableTypes) {
            let availableFields = fields.filter(
                (f) =>
                    attribute.availableTypes.includes(f.type) &&
                    f.name !== this.env.viewEditorModel.activeNode.attrs.name
            );
            if (attribute.name === "currency_field") {
                availableFields = availableFields.filter((f) => f.relation === "res.currency");
            }
            return availableFields.map((f) => {
                return {
                    label: this.env.debug ? `${f.string} (${f.name})` : f.string,
                    value: f.name,
                };
            });
        }
        return fields;
    }

    /**
     * Compute the property and its value from one or more attributes on the node
     */
    getPropertyFromAttributes(property, props) {
        let value;
        value = props.node.attrs[property.name];
        if (property.getValue) {
            const attrs = props.node.attrs || {};
            const field = props.node.field || {};
            value = property.getValue({ attrs, field });
        }
        if (value === undefined && property.default) {
            value = property.default;
        }
        return {
            ...property,
            value,
        };
    }

    /**
     * Compute the property and its value from the `options` attribute on the node
     */
    getPropertyFromOptions(property, props) {
        let value;
        if (COMPUTED_DISPLAY_OPTIONS[property.name]) {
            // The display of this property must be computed from the value of the corresponding super option
            const dependentOption = COMPUTED_DISPLAY_OPTIONS[property.name];
            const superOption = this.attributesForCurrentTypeAndWidget.find(
                (o) => o.name === dependentOption.superOption
            );
            const superValue = this.getPropertyFromOptions(superOption, props).value;
            if (dependentOption.getReadonly) {
                property.isReadonly = dependentOption.getReadonly(superValue);
            }
            if (dependentOption.getValue) {
                property.value = dependentOption.getValue(superValue);
                if (property.isReadonly) {
                    // The property value cannot be edited, return the computed value directly
                    return property;
                }
            }
            if (dependentOption.getInvisible) {
                property.isInvisible = dependentOption.getInvisible(superValue);
            }
        }
        value = props.node.attrs.options?.[property.name];
        if (property.type === "string") {
            value = JSON.stringify(value);
        }
        if (value === undefined && property.default) {
            value = property.default;
        }
        if (property.name === "currency_field" && !value) {
            value = props.node.field.currency_field;
        }
        return {
            ...property,
            value,
        };
    }

    getSelectValue(value) {
        return typeof value === "object" ? JSON.stringify(value) : value;
    }

    async onChangeCurrency(value) {
        const proms = [];
        proms.push(
            this.rpc("/web_studio/set_currency", {
                model_name: this.env.viewEditorModel.resModel,
                field_name: this.props.node.field.name,
                value,
            })
        );
        this.env.viewEditorModel.fields[this.props.node.field.name]["currency_field"] = value;

        if (this.env.viewEditorModel.fieldsInArch.includes(value)) {
            // is the new currency in the view ?
            await Promise.all(proms).then((results) => {
                if (results[0] === true) {
                    this.env.viewEditorModel.fields[this.props.node.field.name]["currency_field"] =
                        value;
                }
            });
            // alter the value of the currently selected currency manually to trigger a re-render of the SelectMenu
            // with the correct value since we don't pass through doOperations from the ViewEditorModel
            this.attributes.field = this.attributes.field.map((e) => {
                if (e.name === "currency_field") {
                    e.value = value;
                }
                return e;
            });
            return;
        }

        const currencyNode = {
            tag: "field",
            attrs: { name: value },
        };

        const operation = {
            node: currencyNode,
            target: this.env.viewEditorModel.getFullTarget(
                this.env.viewEditorModel.activeNodeXpath
            ),
            position: "after",
            type: "add",
        };

        proms.push(this.env.viewEditorModel.doOperation(operation));
        await Promise.all(proms).then((results) => {
            if (results[0] === true) {
                this.env.viewEditorModel.fields[this.props.node.field.name]["currency_field"] =
                    value;
            }
        });
    }

    onChangeWidget(value) {
        return this.props.onChangeAttribute(value, "widget");
    }

    async onChangeProperty(value, name) {
        const currentProperty = this.attributesForCurrentTypeAndWidget.find((e) => e.name === name);
        if (name === "currency_field" && this.props.node.field.type === "monetary") {
            await this.onChangeCurrency(value);
            if (!this.props.node.attrs.options?.[name]) {
                return;
            }
            value = ""; // the currency_field arch option will be deleted
        }
        if (EDITABLE_ATTRIBUTES[name]) {
            return this.props.onChangeAttribute(value, name);
        }
        const options = { ...this.props.node.attrs.options };
        if (value || currentProperty.type === "boolean") {
            if (["[", "{"].includes(value[0]) || !isNaN(value)) {
                options[name] = JSON.parse(value);
            } else if (currentProperty.type === "number") {
                options[name] = Number(value);
            } else {
                options[name] = value;
            }
        } else {
            delete options[name];
        }
        this.props.onChangeAttribute(JSON.stringify(options), "options");
    }
}
