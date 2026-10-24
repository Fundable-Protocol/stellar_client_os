/**
 * Campaign Impact Metric Service
 *
 * Validates and evaluates creator-defined impact formulas for socially-focused
 * campaigns. A creator defines a metric (name, unit) and a formula that maps
 * the amount raised to an impact number (e.g. "amount_raised / cost_per_unit"
 * to convert dollars raised into meals provided).
 *
 * Supported formula variables:
 *   - amount_raised
 *   - cost_per_unit
 *
 * Supported operators: + - * / and parentheses.
 */

export interface ImpactMetricDefinition {
  /** Human-readable metric name, e.g. "Meals Provided". */
  name: string;
  /** Unit label for the impact value, e.g. "meals". */
  unit: string;
  /** Cost (in currency) to produce one unit of impact. Must be > 0. */
  costPerUnit: number;
  /** Formula mapping amount raised to impact value. */
  formula: string;
}

export interface ImpactMetricResult {
  /** Raw computed impact value. */
  value: number;
  /** Rounded, digit-grouped display string. */
  formattedValue: string;
  /** Unit label from the definition. */
  unit: string;
}

export interface ImpactMetricValidationResult {
  valid: boolean;
  errors: string[];
}

const SUPPORTED_VARIABLES = ['amount_raised', 'cost_per_unit'] as const;
type SupportedVariable = (typeof SUPPORTED_VARIABLES)[number];

const SUPPORTED_OPERATORS = new Set(['+', '-', '*', '/', '(', ')']);

/**
 * Token types produced by the formula tokenizer.
 */
type Token =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: SupportedVariable }
  | { type: 'operator'; value: string };

/**
 * Tokenize a formula string into numbers, variables, and operators.
 * Throws on unsupported characters or malformed tokens.
 */
function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < formula.length) {
    const char = formula[i];

    // Skip whitespace.
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Numbers (integers and decimals).
    if (/[0-9.]/.test(char)) {
      let numStr = '';
      let dotCount = 0;
      while (i < formula.length && /[0-9.]/.test(formula[i])) {
        if (formula[i] === '.') {
          dotCount++;
          if (dotCount > 1) {
            throw new Error(`Invalid number in formula at position ${i}`);
          }
        }
        numStr += formula[i];
        i++;
      }
      const value = Number(numStr);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number "${numStr}" in formula`);
      }
      tokens.push({ type: 'number', value });
      continue;
    }

    // Identifiers (variables).
    if (/[a-zA-Z_]/.test(char)) {
      let ident = '';
      while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) {
        ident += formula[i];
        i++;
      }
      if (!(SUPPORTED_VARIABLES as readonly string[]).includes(ident)) {
        throw new Error(`Unsupported formula token "${ident}"`);
      }
      tokens.push({ type: 'variable', name: ident as SupportedVariable });
      continue;
    }

    // Operators and parentheses.
    if (SUPPORTED_OPERATORS.has(char)) {
      tokens.push({ type: 'operator', value: char });
      i++;
      continue;
    }

    throw new Error(`Unsupported formula token "${char}" at position ${i}`);
  }

  if (tokens.length === 0) {
    throw new Error('Formula is empty');
  }

  return tokens;
}

/**
 * Recursive-descent parser/evaluator.
 *
 * Grammar:
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/') factor)*
 *   factor     := ('-' factor) | number | variable | '(' expression ')'
 */
class FormulaEvaluator {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly variables: Record<SupportedVariable, number>,
  ) {}

  evaluate(): number {
    const result = this.parseExpression();
    if (this.pos !== this.tokens.length) {
      throw new Error('Unexpected token in formula');
    }
    return result;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      const token = this.peek();
      if (token && token.type === 'operator' && (token.value === '+' || token.value === '-')) {
        this.pos++;
        const rhs = this.parseTerm();
        value = token.value === '+' ? value + rhs : value - rhs;
      } else {
        break;
      }
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    while (true) {
      const token = this.peek();
      if (token && token.type === 'operator' && (token.value === '*' || token.value === '/')) {
        this.pos++;
        const rhs = this.parseFactor();
        if (token.value === '*') {
          value = value * rhs;
        } else {
          if (rhs === 0) {
            throw new Error('Division by zero in formula');
          }
          value = value / rhs;
        }
      } else {
        break;
      }
    }
    return value;
  }

  private parseFactor(): number {
    const token = this.peek();
    if (!token) {
      throw new Error('Unexpected end of formula');
    }

    if (token.type === 'operator' && token.value === '-') {
      this.pos++;
      return -this.parseFactor();
    }

    if (token.type === 'operator' && token.value === '+') {
      this.pos++;
      return this.parseFactor();
    }

    if (token.type === 'number') {
      this.pos++;
      return token.value;
    }

    if (token.type === 'variable') {
      this.pos++;
      return this.variables[token.name];
    }

    if (token.type === 'operator' && token.value === '(') {
      this.pos++;
      const value = this.parseExpression();
      const closing = this.peek();
      if (!closing || closing.type !== 'operator' || closing.value !== ')') {
        throw new Error('Missing closing parenthesis in formula');
      }
      this.pos++;
      return value;
    }

    throw new Error(`Unexpected token in formula: "${token.value ?? token.name}"`);
  }
}

/**
 * Validate a creator-defined impact metric definition.
 *
 * Rejects:
 *   - empty name or unit
 *   - non-positive (or non-finite) costPerUnit
 *   - empty formula
 *   - formulas containing unsupported tokens or malformed syntax
 */
export function validateImpactMetricDefinition(
  def: ImpactMetricDefinition,
): ImpactMetricValidationResult {
  const errors: string[] = [];

  if (!def || typeof def !== 'object') {
    return { valid: false, errors: ['Impact metric definition is required'] };
  }

  if (typeof def.name !== 'string' || def.name.trim().length === 0) {
    errors.push('Metric name is required');
  }

  if (typeof def.unit !== 'string' || def.unit.trim().length === 0) {
    errors.push('Metric unit is required');
  }

  if (
    typeof def.costPerUnit !== 'number' ||
    !Number.isFinite(def.costPerUnit) ||
    def.costPerUnit <= 0
  ) {
    errors.push('costPerUnit must be a positive number');
  }

  if (typeof def.formula !== 'string' || def.formula.trim().length === 0) {
    errors.push('Formula is required');
  } else {
    try {
      const tokens = tokenize(def.formula);
      // Validate syntax by evaluating with placeholder values.
      new FormulaEvaluator(tokens, {
        amount_raised: 1,
        cost_per_unit: 1,
      }).evaluate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid formula';
      errors.push(message);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Format an impact value for display: round to a whole number and group
 * digits with thousands separators.
 */
export function formatImpactValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) {
    return `0 ${unit}`.trim();
  }
  const rounded = Math.round(value);
  const grouped = rounded.toLocaleString('en-US');
  return unit ? `${grouped} ${unit}` : grouped;
}

/**
 * Evaluate a creator-defined impact metric against an amount raised.
 *
 * Parses the formula (supporting `amount_raised`, `cost_per_unit`, and simple
 * arithmetic) and returns the computed impact number along with a formatted
 * display value and the metric unit.
 */
export function evaluateImpactMetric(
  def: ImpactMetricDefinition,
  raisedAmount: number,
): ImpactMetricResult {
  const validation = validateImpactMetricDefinition(def);
  if (!validation.valid) {
    throw new Error(`Invalid impact metric definition: ${validation.errors.join('; ')}`);
  }

  if (typeof raisedAmount !== 'number' || !Number.isFinite(raisedAmount)) {
    throw new Error('raisedAmount must be a finite number');
  }

  const tokens = tokenize(def.formula);
  const rawValue = new FormulaEvaluator(tokens, {
    amount_raised: raisedAmount,
    cost_per_unit: def.costPerUnit,
  }).evaluate();

  // Guard against negative impact values from odd formulas.
  const value = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;

  return {
    value,
    formattedValue: formatImpactValue(value, def.unit),
    unit: def.unit,
  };
}