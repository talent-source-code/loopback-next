// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: @loopback/core
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {
  bind,
  Binding,
  BindingFilter,
  BindingScope,
  filterByTag,
  BindingTemplate,
} from '@loopback/context';
import {PathParams, RequestHandlerParams} from 'express-serve-static-core';

/**
 * Spec for a middleware entry
 */
export interface MiddlewareSpec {
  // Path to be mounted
  path?: PathParams;
  // Optional phase for ordering
  phase?: string;
}

export type MiddlewareHandler = RequestHandlerParams;

/**
 * Configure the binding as express middleware
 * @param binding Binding
 */
export function asMiddlewareBinding(
  spec?: MiddlewareSpec,
): BindingTemplate<MiddlewareHandler> {
  const tags = Object.assign({}, spec);
  return (binding: Binding<MiddlewareHandler>) => {
    return binding
      .tag('middleware')
      .inScope(BindingScope.SINGLETON)
      .tag(tags);
  };
}

/**
 * A filter function to find all middleware bindings
 */
export const middlewareFilter: BindingFilter = filterByTag('middleware');

/**
 * A sugar `@middleware` decorator to simplify `@bind` for middleware classes
 * @param spec Middleware spec
 */
export function middleware(spec?: MiddlewareSpec) {
  return bind({tags: spec}, asMiddlewareBinding(spec));
}
