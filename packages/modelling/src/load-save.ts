import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { ComponentDef, ComponentSchema, EntityID } from "@oasys/oecs";
import { ComponentRegistry } from "./components/registry";
import { entityAddChild } from "./components/parent-component";

export function loadEcsFromXml(
  componentRegistery: ComponentRegistry,
  ecs: ReactiveECS,
  xmlData: string,
  clearExisting = true,
): void {
  let parser = new DOMParser();
  let xmlDoc = parser.parseFromString(xmlData, "application/xml");
  if (clearExisting) {
    ecs.ecs.query().for_each((arch) => {
      for (let i = 0; i < arch.entity_count; ++i) {
        let entityId = arch.entity_ids[i] as EntityID;
        ecs.destroy_entity_deferred(entityId);
      }
    });
    ecs.ecs.flush();
  }
  let loadEntity = (parentId: EntityID | undefined, element: Element) => {
    let tagName = element.tagName;
    let primaryComponentDef = (componentRegistery as any)[tagName] as ComponentDef<ComponentSchema>;
    let componentSchema = componentRegistery.componentTypeToSchemaMap.get(primaryComponentDef);
    if (componentSchema === undefined) {
      return;
    }
    let entityId = ecs.create_entity();
    let object: Record<string,number> = {};
    for (let fieldName in componentSchema) {
      let attrValue = element.getAttribute(fieldName);
      let value: number;
      if (attrValue === null) {
        value = 0.0;
      } else {
        value = Number.parseFloat(attrValue);
        if (Number.isNaN(value)) {
          value = 0.0;
        }
      }
      object[fieldName] = value;
    }
    ecs.add_component(
      entityId,
      primaryComponentDef,
      object,
    );
    let otherComponentTypeNames = new Set(element.getAttributeNames().flatMap((attributeName) => {
      let match = /^(.*)?\..*$/.exec(attributeName);
      if (match === null) {
        return [];
      }
      return [ match[1], ];
    }));
    for (let componentTypeName of otherComponentTypeNames) {
      let componentType = componentRegistery[componentTypeName as keyof ComponentRegistry] as ComponentDef | undefined;
      if (componentType === undefined) {
        continue;
      }
      let obj: any = {};
      let schema = componentRegistery.componentTypeToSchemaMap.get(componentType);
      if (schema === undefined) {
        continue;
      }
      for (let fieldName in schema) {
        let attributeName = `${componentTypeName}.${fieldName}`;
        let attributeValue = element.getAttribute(attributeName);
        let value: number;
        if (attributeValue !== null) {
          value = Number.parseFloat(attributeValue);
          if (Number.isNaN(value)) {
            value = 0.0;
          }
        } else {
          value = 0.0;
        }
        obj[fieldName] = value;
      }
      ecs.add_component(
        entityId,
        componentType,
        obj,
      );
    }
    if (parentId !== undefined) {
      entityAddChild(
        componentRegistery,
        ecs,
        parentId,
        entityId,
      );
    }
    for (let child of element.children) {
      loadEntity(entityId, child);
    }
  };
  for (let child of xmlDoc.children?.[0]?.children ?? []) {
    loadEntity(undefined, child);
  }
}

export function saveEcsToXml(
  componentRegistery: ComponentRegistry,
  primaryComponentTypes: ComponentDef[],
  ecs: ReactiveECS
): string {
  let xmlDoc = document.implementation.createDocument("", "melty-karts-level");
  let root = xmlDoc.documentElement;
  let writeEntity = (parent: HTMLElement, entityId: EntityID) => {
    let primaryComponentType: ComponentDef | undefined = undefined;
    for (let componentType of primaryComponentTypes) {
      if (ecs.ecs.has_component(entityId, componentType)) {
        primaryComponentType = componentType;
        break;
      }
    }
    let primaryComponentTypeName: string | undefined = undefined;
    for (let componentTypeName in componentRegistery) {
      let componentType = componentRegistery[componentTypeName as keyof ComponentRegistry];
      if (componentType === primaryComponentType) {
        primaryComponentTypeName = componentTypeName;
        break;
      }
    }
    let element: HTMLElement;
    if (primaryComponentTypeName !== undefined) {
      element = xmlDoc.createElement(primaryComponentTypeName);
    } else {
      element = xmlDoc.createElement("Entity");
    }
    if (primaryComponentType !== undefined) {
      let schema = componentRegistery.componentTypeToSchemaMap.get(primaryComponentType);
      if (schema !== undefined) {
        for (let fieldName in schema) {
          let fieldValue = ecs.ecs.get_field(
            entityId,
            primaryComponentType,
            fieldName,
          );
          element.setAttribute(fieldName, fieldValue.toString());
        }
      }
    }
    for (let componentTypeName of Object.keys(componentRegistery)) {
      if (componentTypeName === "componentTypeToSchemaMap") {
        continue;
      }
      let componentType = componentRegistery[componentTypeName as keyof ComponentRegistry] as ComponentDef<ComponentSchema>;
      if (
        componentType === primaryComponentType ||
        componentType === componentRegistery.Parent ||
        componentType === componentRegistery.Child
      ) {
        continue;
      }
      if (ecs.ecs.has_component(entityId, componentType)) {
        let schema = componentRegistery.componentTypeToSchemaMap.get(componentType);
        if (schema !== undefined) {
          for (let fieldName in schema) {
            let fieldValue = ecs.ecs.get_field(
              entityId,
              componentType,
              fieldName,
            );
            element.setAttribute(`${componentTypeName}.${fieldName}`, fieldValue.toString());
          }
        }
      }
    }
    parent.appendChild(element);
    if (ecs.ecs.has_component(entityId, componentRegistery.Parent)) {
      let headId = ecs.ecs.get_field(
        entityId,
        componentRegistery.Parent,
        "head",
      ) as EntityID | -1;
      let atId = headId;
      while (atId !== -1) {
        let childId = atId;
        writeEntity(element, childId);
        atId = ecs.ecs.get_field(
          childId,
          componentRegistery.Child,
          "next",
        ) as EntityID | -1;
      }
    }
  };
  ecs.ecs.query().for_each((arch) => {
    for (let i = 0; i < arch.entity_count; ++i) {
      let entityId = arch.entity_ids[i] as EntityID;
      if (ecs.ecs.has_component(entityId, componentRegistery.Child)) {
        continue;
      }
      writeEntity(root, entityId);
    }
  });
  const xmlString = prettyPrintXML(xmlDoc);
  return xmlString;
}

function prettyPrintXML(xmlDoc: XMLDocument) {
  // Recursive helper function to build the indented string
  function serializeNode(node: HTMLElement, indentLevel = 0) {
    const spaces = ' '.repeat(indentLevel * 2);
    let result = '';
    // Handle Element Nodes
    if (node.nodeType === 1) {
      result += `${spaces}<${node.nodeName}`;
      // Serialize attributes
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        result += ` ${attr.name}="${attr.value}"`;
      }
      if (node.childNodes.length === 0) {
        result += ' />\n';
      } else {
        result += '>\n';
        // Serialize children
        let hasElementChildren = false;
        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes[i] as HTMLElement;
          if (child.nodeType === 1) {
            hasElementChildren = true;
          }
          result += serializeNode(child, indentLevel + 1);
        }
        // Adjust formatting if it only contains text node vs child elements
        result += `${spaces}</${node.nodeName}>\n`;
      }
    }
    // Handle Text Nodes (ignore empty whitespace nodes)
    else if (node.nodeType === 3 && node.nodeValue !== null) {
      const text = node.nodeValue.trim();
      if (text) {
        result += `${spaces}${text}\n`;
      }
    }
    return result;
  }
  // Start serialization from the root element
  return serializeNode(xmlDoc.documentElement).trim();
}
