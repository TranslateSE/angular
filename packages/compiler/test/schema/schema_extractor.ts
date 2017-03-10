/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

const SVG_PREFIX = ':svg:';

// Element | Node interfaces
// see https://developer.mozilla.org/en-US/docs/Web/API/Element
// see https://developer.mozilla.org/en-US/docs/Web/API/Node
const ELEMENT_IF = '[Element]';
// HTMLElement interface
// see https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement
const HTMLELEMENT_IF = '[HTMLElement]';

const HTMLELEMENT_TAGS =
    'abbr,address,article,aside,b,bdi,bdo,cite,code,dd,dfn,dt,em,figcaption,figure,footer,header,i,kbd,main,mark,nav,noscript,rb,rp,rt,rtc,ruby,s,samp,section,small,strong,sub,sup,u,var,wbr';

const ALL_HTML_TAGS =
    // https://www.w3.org/TR/html5/index.html
    'a,abbr,address,area,article,aside,audio,b,base,bdi,bdo,blockquote,body,br,button,canvas,caption,cite,code,col,colgroup,data,datalist,dd,del,dfn,div,dl,dt,em,embed,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,head,header,hr,html,i,iframe,img,input,ins,kbd,keygen,label,legend,li,link,main,map,mark,meta,meter,nav,noscript,object,ol,optgroup,option,output,p,param,pre,progress,q,rb,rp,rt,rtc,ruby,s,samp,script,section,select,small,source,span,strong,style,sub,sup,table,tbody,td,template,textarea,tfoot,th,thead,time,title,tr,track,u,ul,var,video,wbr,' +
    // https://html.spec.whatwg.org/
    'details,summary,menu,menuitem';

// Elements missing from Chrome (HtmlUnknownElement), to be manually added
const MISSING_FROM_CHROME: {[el: string]: string[]} = {
  'data^[HTMLElement]': ['value'],
  // TODO(vicb): Figure out why Chrome and WhatWG do not agree on the props
  // 'menu^[HTMLElement]': ['type', 'label'],
  'menuitem^[HTMLElement]':
      ['type', 'label', 'icon', '!disabled', '!checked', 'radiogroup', '!default'],
  'summary^[HTMLElement]': [],
  'time^[HTMLElement]': ['dateTime'],
};

const _G: any = global;
const document: any = typeof _G['document'] == 'object' ? _G['document'] : null;

export function extractSchema(): Map<string, string[]> {
  if (!document) return null;
  const SVGGraphicsElement = _G['SVGGraphicsElement'];
  if (!SVGGraphicsElement) return null;

  const SVGAnimationElement = _G['SVGAnimationElement'];
  const SVGGeometryElement = _G['SVGGeometryElement'];
  const SVGComponentTransferFunctionElement = _G['SVGComponentTransferFunctionElement'];
  const SVGGradientElement = _G['SVGGradientElement'];
  const SVGTextContentElement = _G['SVGTextContentElement'];
  const SVGTextPositioningElement = _G['SVGTextPositioningElement'];
  const element = document.createElement('video');
  const svgAnimation = document.createElementNS('http://www.w3.org/2000/svg', 'set');
  const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const svgFeFuncA = document.createElementNS('http://www.w3.org/2000/svg', 'feFuncA');
  const svgGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  const svgText = document.createElementNS('http://www.w3.org/2000/svg', 'text');

  const descMap: Map<string, string[]> = new Map();
  const visited: {[name: string]: boolean} = {};

  // HTML top level
  extractProperties(Node, element, visited, descMap, ELEMENT_IF, '');
  extractProperties(Element, element, visited, descMap, ELEMENT_IF, '');
  extractProperties(HTMLElement, element, visited, descMap, HTMLELEMENT_IF, ELEMENT_IF);
  extractProperties(HTMLElement, element, visited, descMap, HTMLELEMENT_TAGS, HTMLELEMENT_IF);
  extractProperties(HTMLMediaElement, element, visited, descMap, 'media', HTMLELEMENT_IF);

  // SVG top level
  extractProperties(SVGElement, svgText, visited, descMap, SVG_PREFIX, HTMLELEMENT_IF);
  extractProperties(
      SVGGraphicsElement, svgText, visited, descMap, SVG_PREFIX + 'graphics', SVG_PREFIX);
  extractProperties(
      SVGAnimationElement, svgAnimation, visited, descMap, SVG_PREFIX + 'animation', SVG_PREFIX);
  extractProperties(
      SVGGeometryElement, svgPath, visited, descMap, SVG_PREFIX + 'geometry', SVG_PREFIX);
  extractProperties(
      SVGComponentTransferFunctionElement, svgFeFuncA, visited, descMap,
      SVG_PREFIX + 'componentTransferFunction', SVG_PREFIX);
  extractProperties(
      SVGGradientElement, svgGradient, visited, descMap, SVG_PREFIX + 'gradient', SVG_PREFIX);
  extractProperties(
      SVGTextContentElement, svgText, visited, descMap, SVG_PREFIX + 'textContent',
      SVG_PREFIX + 'graphics');
  extractProperties(
      SVGTextPositioningElement, svgText, visited, descMap, SVG_PREFIX + 'textPositioning',
      SVG_PREFIX + 'textContent');

  // Get all element types
  const types = Object.getOwnPropertyNames(window).filter(k => /^(HTML|SVG).*?Element$/.test(k));

  types.sort();

  types.forEach(type => { extractRecursiveProperties(visited, descMap, (window as any)[type]); });

  // Add elements missed by Chrome auto-detection
  Object.keys(MISSING_FROM_CHROME).forEach(elHierarchy => {
    descMap.set(elHierarchy, MISSING_FROM_CHROME[elHierarchy]);
  });

  assertNoMissingTags(descMap);

  return descMap;
}

function assertNoMissingTags(descMap: Map<string, string[]>): void {
  const extractedTags: string[] = [];

  Array.from(descMap.keys()).forEach((key: string) => {
    extractedTags.push(...key.split('|')[0].split('^')[0].split(','));
  });

  const missingTags = ALL_HTML_TAGS.split(',').filter(tag => extractedTags.indexOf(tag) == -1);

  if (missingTags.length) {
    throw new Error(`DOM schema misses tags: ${missingTags.join(',')}`);
  }
}

function extractRecursiveProperties(
    visited: {[name: string]: boolean}, descMap: Map<string, string[]>, type: Function): string {
  const name = extractName(type);

  if (visited[name]) {
    return name;
  }

  let superName: string;
  switch (name) {
    case ELEMENT_IF:
      // ELEMENT_IF is the top most interface (Element | Node)
      superName = '';
      break;
    case HTMLELEMENT_IF:
      superName = ELEMENT_IF;
      break;
    default:
      superName =
          extractRecursiveProperties(visited, descMap, type.prototype.__proto__.constructor);
  }

  let instance: HTMLElement = null;
  name.split(',').forEach(tagName => {
    instance = type['name'].startsWith('SVG') ?
        document.createElementNS('http://www.w3.org/2000/svg', tagName.replace(SVG_PREFIX, '')) :
        document.createElement(tagName);

    let htmlType: Function;

    switch (tagName) {
      case 'cite':
        // <cite> interface is `HTMLQuoteElement`
        htmlType = HTMLElement;
        break;
      default:
        htmlType = type;
    }

    if (!(instance instanceof htmlType)) {
      throw new Error(`Tag <${tagName}> is not an instance of ${htmlType['name']}`);
    }
  });

  extractProperties(type, instance, visited, descMap, name, superName);

  return name;
}

function extractProperties(
    type: Function, instance: any, visited: {[name: string]: boolean},
    descMap: Map<string, string[]>, name: string, superName: string) {
  if (!type) return;

  visited[name] = true;

  const fullName = name + (superName ? '^' + superName : '');

  const props: string[] = descMap.has(fullName) ? descMap.get(fullName) : [];

  const prototype = type.prototype;
  const keys = Object.getOwnPropertyNames(prototype);

  keys.sort();
  keys.forEach((name) => {
    if (name.startsWith('on')) {
      props.push('*' + name.substr(2));
    } else {
      const typeCh = _TYPE_MNEMONICS[typeof instance[name]];
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      const isSetter = descriptor && descriptor.set;
      if (typeCh !== void 0 && !name.startsWith('webkit') && isSetter) {
        props.push(typeCh + name);
      }
    }
  });

  // There is no point in using `Node.nodeValue`, filter it out
  descMap.set(fullName, type === Node ? props.filter(p => p != '%nodeValue') : props);
}

function extractName(type: Function): string {
  let name = type['name'];

  switch (name) {
    // see https://www.w3.org/TR/html5/index.html
    // TODO(vicb): generate this map from all the element types
    case 'Element':
      return ELEMENT_IF;
    case 'HTMLElement':
      return HTMLELEMENT_IF;
    case 'HTMLImageElement':
      return 'img';
    case 'HTMLAnchorElement':
      return 'a';
    case 'HTMLDListElement':
      return 'dl';
    case 'HTMLDirectoryElement':
      return 'dir';
    case 'HTMLHeadingElement':
      return 'h1,h2,h3,h4,h5,h6';
    case 'HTMLModElement':
      return 'ins,del';
    case 'HTMLOListElement':
      return 'ol';
    case 'HTMLParagraphElement':
      return 'p';
    case 'HTMLQuoteElement':
      return 'q,blockquote,cite';
    case 'HTMLTableCaptionElement':
      return 'caption';
    case 'HTMLTableCellElement':
      return 'th,td';
    case 'HTMLTableColElement':
      return 'col,colgroup';
    case 'HTMLTableRowElement':
      return 'tr';
    case 'HTMLTableSectionElement':
      return 'tfoot,thead,tbody';
    case 'HTMLUListElement':
      return 'ul';
    case 'SVGGraphicsElement':
      return SVG_PREFIX + 'graphics';
    case 'SVGMPathElement':
      return SVG_PREFIX + 'mpath';
    case 'SVGSVGElement':
      return SVG_PREFIX + 'svg';
    case 'SVGTSpanElement':
      return SVG_PREFIX + 'tspan';
    default:
      const isSVG = name.startsWith('SVG');
      if (name.startsWith('HTML') || isSVG) {
        name = name.replace('HTML', '').replace('SVG', '').replace('Element', '');
        if (isSVG && name.startsWith('FE')) {
          name = 'fe' + name.substring(2);
        } else if (name) {
          name = name.charAt(0).toLowerCase() + name.substring(1);
        }
        return isSVG ? SVG_PREFIX + name : name.toLowerCase();
      }
  }

  return null;
}

const _TYPE_MNEMONICS: {[type: string]: string} = {
  'string': '',
  'number': '#',
  'boolean': '!',
  'object': '%',
};