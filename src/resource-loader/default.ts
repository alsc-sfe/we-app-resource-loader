/**
 * 这里依赖的System从window底下取，原因有两个：
 * 1. CRM的基础库依赖systemjs，如react、antd等的system module
 * 2. import systemjs仍然会注册到window底下，可能造成全局污染
 *
 * 解决办法：
 * 1. 全局手动引入，部署多一步
 * 2. 默认resourceLoader内置systemjs依赖，可能造成全局污染
 */
import { SafeHookScope, Resource, ResourceLoaderDesc, ResourceLoader } from '@saasfe/we-app-types';
import { isObj, isFunction, isString, loadScript, loadCSS, removeScript, removeCSS, checkWhile } from '@saasfe/we-app-utils';


export interface DefaultResourceLoaderOpts {
  useSystem?: boolean;
  /**
   * 获取js文件导出入口，例如umd的全局变量
   */
  getEntry?: (module: any, resourec: Resource, activeScope: SafeHookScope) => any;
}

const resourceLoader: ResourceLoaderDesc<DefaultResourceLoaderOpts> = {
  async mount(
    resource: Resource,
    activeScope: SafeHookScope,
    opts: DefaultResourceLoaderOpts = { useSystem: true }
  ) {
    const { root = window } = activeScope;
    const { useSystem, getEntry } = opts;

    if (isString(resource)) {
      if ((resource as string).indexOf('.js') > -1) {
        if (useSystem) {
          let System;
          if (root.System && root.System.import) {
            System = root.System;
          } else {
            throw new Error('[we app](Error from resourceLoader)请先引入systemjs');
          }
          const mod = System.import(resource);
          if (isFunction(getEntry)) {
            return mod.then((module: any) => getEntry(module, resource, activeScope));
          }
          return mod;
        }

        const mod = loadScript(resource as string);
        if (isFunction(getEntry)) {
          return mod.then(() => getEntry(null, resource, activeScope));
        }
        return mod;
      }

      if ((resource as string).indexOf('.css') > -1) {
        return loadCSS(resource as string).then(() => undefined);
      }
    }

    if (isFunction(resource)) {
      return (resource as Function)();
    }

    return resource;
  },

  async unmount(
    resource: Resource,
    activeScope: SafeHookScope,
    opts: DefaultResourceLoaderOpts = { useSystem: true }
  ) {
    const { root = window } = activeScope;
    const { useSystem } = opts;

    if (isString(resource)) {
      if ((resource as string).indexOf('.js') > -1) {
        if (useSystem) {
          root.System && root.System.delete(resource as string);
          return;
        }

        removeScript(resource as string);
        return;
      }

      if ((resource as string).indexOf('.css') > -1) {
        removeCSS(resource as string);
      }
    }
  },
};

const DefaultResourceLoaderDesc: ResourceLoaderDesc<DefaultResourceLoaderOpts> = {
  async mount(
    resource: Resource[],
    activeScope: SafeHookScope,
    opts: DefaultResourceLoaderOpts = { useSystem: true }
  ) {
    let url = resource;
    if (!Array.isArray(resource)) {
      url = [resource];
    }
    const mountedUrl = url.map((r) => {
      return resourceLoader.mount(r, activeScope, opts);
    });
    // 获取第一个不为空的返回值
    const component = await Promise.all(mountedUrl).then((coms) => {
      const com = coms.find((r) => r);
      return com;
    }).then((com: any) => com?.default || com);

    return component;
  },

  async unmount(
    resource: Resource[],
    activeScope: SafeHookScope,
    opts: DefaultResourceLoaderOpts = { useSystem: true }
  ) {
    let url = resource;
    if (!Array.isArray(resource)) {
      url = [resource];
    }
    return url.map((r) => {
      return resourceLoader.unmount(r, activeScope, opts);
    });
  },
};

export const DefaultResourceLoader: ResourceLoader<DefaultResourceLoaderOpts> = {
  desc: DefaultResourceLoaderDesc,
  config: {
    useSystem: true,
    getEntry(module: any, _resource: Resource, activeScope: SafeHookScope) {
      // 为 System Module，则返回模块内容
      if (isObj(module, '[object Module]')) {
        return module.default || module;
      }
      // 有值但不是事件
      if (module && !(module instanceof Event)) {
        return module;
      }
      // 取全局变量
      const { appName, pageName } = activeScope;
      if (appName && pageName) {
        const argName = `__weapp__${appName.replace(/-/g, '_')}__${pageName.replace(/-/g, '_')}`;
        return checkWhile(() => window[argName]).then(() => {
          const mod = window[argName];
          if (mod) {
            return mod;
          }
        });
      }
    },
  },
};
