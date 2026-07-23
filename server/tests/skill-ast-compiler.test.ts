/**
 * skill-ast-compiler.test.ts — Tests for AST-based skill compilation.
 * Phase 2, Task P2-07.
 */
import { describe, it, expect } from 'vitest';
import {
  ast,
  generateCode,
  compilePattern,
  type ASTNode,
  type ProgramNode,
} from '../src/services/skill-ast-compiler.js';

describe('AST Builder', () => {
  it('creates literal nodes', () => {
    const node = ast.literal(42);
    expect(node.type).toBe('Literal');
    expect(node.value).toBe(42);
    expect(node.raw).toBe('42');
  });

  it('creates string literal', () => {
    const node = ast.literal('hello');
    expect(node.value).toBe('hello');
    expect(node.raw).toBe('"hello"');
  });

  it('creates null literal', () => {
    const node = ast.literal(null);
    expect(node.value).toBeNull();
  });

  it('creates identifier nodes', () => {
    const node = ast.identifier('foo');
    expect(node.type).toBe('Identifier');
    expect(node.name).toBe('foo');
  });

  it('creates member expression', () => {
    const node = ast.memberAccess(ast.identifier('obj'), 'prop');
    expect(node.type).toBe('MemberExpression');
    expect(node.computed).toBe(false);
  });

  it('creates computed member expression', () => {
    const node = ast.computedAccess(ast.identifier('obj'), ast.literal('key'));
    expect(node.type).toBe('MemberExpression');
    expect(node.computed).toBe(true);
  });

  it('creates object expression', () => {
    const node = ast.objectExpression([
      { key: 'name', value: ast.memberAccess(ast.identifier('input'), 'name') },
    ]);
    expect(node.type).toBe('ObjectExpression');
    expect(node.properties).toHaveLength(1);
  });

  it('creates array expression', () => {
    const node = ast.arrayExpression([ast.literal(1), ast.literal(2)]);
    expect(node.type).toBe('ArrayExpression');
    expect(node.elements).toHaveLength(2);
  });

  it('creates binary expression', () => {
    const node = ast.binary('+', ast.literal(1), ast.literal(2));
    expect(node.type).toBe('BinaryExpression');
    expect(node.operator).toBe('+');
  });

  it('creates conditional expression', () => {
    const node = ast.conditional(
      ast.binary('>', ast.identifier('x'), ast.literal(0)),
      ast.literal('positive'),
      ast.literal('non-positive')
    );
    expect(node.type).toBe('ConditionalExpression');
  });

  it('creates arrow function', () => {
    const node = ast.arrowFunction(['x'], ast.binary('*', ast.identifier('x'), ast.literal(2)));
    expect(node.type).toBe('ArrowFunctionExpression');
    expect(node.params).toHaveLength(1);
    expect(node.expression).toBe(true);
  });

  it('creates variable declaration', () => {
    const node = ast.constDecl('x', ast.literal(42));
    expect(node.type).toBe('VariableDeclaration');
    expect(node.kind).toBe('const');
  });

  it('creates program node', () => {
    const node = ast.program([
      ast.constDecl('x', ast.literal(1)),
      ast.returnStatement(ast.identifier('x')),
    ]);
    expect(node.type).toBe('Program');
    expect(node.body).toHaveLength(2);
  });

  it('creates template literal', () => {
    const node = ast.templateLiteral(['Hello, ', '!'], [ast.identifier('name')]);
    expect(node.type).toBe('TemplateLiteral');
    expect(node.quasis).toHaveLength(2);
    expect(node.expressions).toHaveLength(1);
  });

  it('creates spread element', () => {
    const node = ast.spread(ast.identifier('arr'));
    expect(node.type).toBe('SpreadElement');
  });

  it('creates call expression', () => {
    const node = ast.call(
      ast.memberAccess(ast.identifier('arr'), 'map'),
      [ast.arrowFunction(['x'], ast.identifier('x'))]
    );
    expect(node.type).toBe('CallExpression');
    expect(node.arguments).toHaveLength(1);
  });
});

describe('Code Generator', () => {
  it('generates literal code', () => {
    expect(generateCode(ast.literal(42))).toBe('42');
    expect(generateCode(ast.literal('hello'))).toBe('"hello"');
    expect(generateCode(ast.literal(true))).toBe('true');
    expect(generateCode(ast.literal(null))).toBe('null');
  });

  it('generates identifier code', () => {
    expect(generateCode(ast.identifier('foo'))).toBe('foo');
  });

  it('generates member access code', () => {
    expect(generateCode(ast.memberAccess(ast.identifier('obj'), 'prop'))).toBe('obj.prop');
  });

  it('generates computed access code', () => {
    expect(generateCode(ast.computedAccess(ast.identifier('obj'), ast.literal('my-key')))).toBe('obj["my-key"]');
  });

  it('generates object expression code', () => {
    const code = generateCode(ast.objectExpression([
      { key: 'name', value: ast.literal('test') },
      { key: 'value', value: ast.literal(42) },
    ]));
    expect(code).toContain('name: "test"');
    expect(code).toContain('value: 42');
  });

  it('generates array expression code', () => {
    expect(generateCode(ast.arrayExpression([ast.literal(1), ast.literal(2)]))).toBe('[1, 2]');
  });

  it('generates binary expression code', () => {
    expect(generateCode(ast.binary('+', ast.literal(1), ast.literal(2)))).toBe('(1 + 2)');
  });

  it('generates arrow function code', () => {
    const code = generateCode(ast.arrowFunction(['x'], ast.binary('*', ast.identifier('x'), ast.literal(2))));
    expect(code).toBe('x => (x * 2)');
  });

  it('generates const declaration', () => {
    const code = generateCode(ast.constDecl('x', ast.literal(42)));
    expect(code).toContain('const x = 42');
  });

  it('generates template literal code', () => {
    const code = generateCode(ast.templateLiteral(['Hello, ', '!'], [ast.identifier('name')]));
    expect(code).toBe('`Hello, ${name}!`');
  });

  it('generates spread element code', () => {
    expect(generateCode(ast.spread(ast.identifier('arr')))).toBe('...arr');
  });

  it('generates conditional expression code', () => {
    const code = generateCode(ast.conditional(
      ast.binary('>', ast.identifier('x'), ast.literal(0)),
      ast.literal('pos'),
      ast.literal('neg')
    ));
    expect(code).toContain('?');
    expect(code).toContain(':');
  });

  it('generates empty object', () => {
    expect(generateCode(ast.objectExpression([]))).toBe('{}');
  });

  it('handles special characters in object keys', () => {
    const code = generateCode(ast.objectExpression([
      { key: 'my-special-key', value: ast.literal(1) },
    ]));
    expect(code).toContain('"my-special-key"');
  });
});

describe('compilePattern', () => {
  it('compiles an identity transform', () => {
    const result = compilePattern({
      inputShape: { name: 'string', age: 'number' },
      outputShape: { name: 'string', age: 'number' },
      sampleInputs: [{ name: 'Alice', age: 30 }],
      sampleOutputs: [{ name: 'Alice', age: 30 }],
      taskLabel: 'identity test',
    });

    expect(result.code).toBeTruthy();
    expect(result.signature).toBeTruthy();
    expect(result.ast.type).toBe('Program');
  });

  it('compiles a field mapping transform', () => {
    const result = compilePattern({
      inputShape: { firstName: 'string', lastName: 'string' },
      outputShape: { name: 'string' },
      sampleInputs: [
        { firstName: 'John', lastName: 'Doe' },
        { firstName: 'Jane', lastName: 'Smith' },
      ],
      sampleOutputs: [
        { name: 'John' },
        { name: 'Jane' },
      ],
      taskLabel: 'name mapping',
    });

    expect(result.code).toContain('compiledTask');
    expect(result.signature).toMatch(/^[a-f0-9]{16}$/);
    expect(result.capabilities.length).toBeGreaterThan(0);
  });

  it('produces deterministic signatures for same input', () => {
    const input = {
      inputShape: { x: 'number' },
      outputShape: { y: 'number' },
      sampleInputs: [{ x: 1 }],
      sampleOutputs: [{ y: 1 }],
      taskLabel: 'test',
    };

    const result1 = compilePattern(input);
    const result2 = compilePattern(input);
    expect(result1.signature).toBe(result2.signature);
  });

  it('includes capabilities in result', () => {
    const result = compilePattern({
      inputShape: { items: 'array' },
      outputShape: { result: 'array' },
      sampleInputs: [{ items: [1, 2, 3] }],
      sampleOutputs: [{ result: [1, 2, 3] }],
      taskLabel: 'array test',
    });

    expect(result.capabilities).toContain('pure:compute');
  });

  it('generates code that includes header comment', () => {
    const result = compilePattern({
      inputShape: { a: 'string' },
      outputShape: { b: 'string' },
      sampleInputs: [{ a: 'test' }],
      sampleOutputs: [{ b: 'test' }],
      taskLabel: 'header test',
    });

    expect(result.code).toContain('Auto-compiled by NEXUS AST Skill Compiler');
    expect(result.code).toContain('header test');
  });

  it('validates determinism against samples', () => {
    const result = compilePattern({
      inputShape: { x: 'number' },
      outputShape: { x: 'number' },
      sampleInputs: [{ x: 1 }, { x: 2 }],
      sampleOutputs: [{ x: 1 }, { x: 2 }],
      taskLabel: 'determinism test',
    });

    expect(result.validationResults.length).toBeGreaterThan(0);
  });
});
