/**
 * External dependencies
 */
/* global HTMLSelectElement */
import { speak } from '@wordpress/a11y';
import {
	getSettings as getDateSettings,
	setSettings as setDateSettings,
} from '@wordpress/date';
import { createElement, useState } from '@wordpress/element';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Internal dependencies
 */
import {
	isNativeSettingsFieldType,
	NativeSettingsField,
} from '../native-fields';
import { toCanonicalDateTime, toCanonicalNumberValue } from '../values';
import type {
	SettingsFieldComponentProps,
	SettingsUIField,
	SettingsValue,
} from '../types';

jest.mock( '@wordpress/a11y', () => ( {
	speak: jest.fn(),
} ) );

const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterAll( () => {
	globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
} );

const renderElement = ( element: JSX.Element ) => {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );

	act( () => {
		root.render( element );
	} );

	return { container, root };
};

const makeProps = (
	field: SettingsUIField,
	value: SettingsValue,
	onChange: ( next: SettingsValue ) => void = () => {}
): SettingsFieldComponentProps => ( {
	field,
	value,
	onChange,
	values: { [ field.id ]: value },
	initialValues: { [ field.id ]: value },
	setValue: () => {},
	setValues: () => {},
	context: { page: 'test-page' },
} );

describe( 'NativeSettingsField', () => {
	let cleanup: ( () => void ) | null = null;
	const originalDateSettings = getDateSettings();

	afterEach( () => {
		cleanup?.();
		cleanup = null;
		setDateSettings( originalDateSettings );
	} );

	const render = ( element: JSX.Element ) => {
		const { container, root } = renderElement( element );
		cleanup = () => {
			act( () => {
				root.unmount();
			} );
			container.remove();
		};
		return container;
	};

	const clickButton = ( button: HTMLElement ) => {
		act( () => {
			button.dispatchEvent(
				new MouseEvent( 'click', { bubbles: true } )
			);
		} );
	};

	const changeInput = ( input: HTMLInputElement, value: string ) => {
		const valueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			'value'
		)?.set;

		act( () => {
			valueSetter?.call( input, value );
			input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		} );
	};

	const blurInput = ( input: HTMLInputElement ) => {
		act( () => {
			input.focus();
			input.blur();
		} );
	};

	const renderStatefulField = (
		field: SettingsUIField,
		initialValue: SettingsValue,
		onChange: jest.Mock
	) => {
		const StatefulField = () => {
			const [ value, setValue ] = useState( initialValue );

			return (
				<NativeSettingsField
					{ ...makeProps( field, value, ( nextValue ) => {
						onChange( nextValue );
						setValue( nextValue );
					} ) }
				/>
			);
		};

		return render( <StatefulField /> );
	};

	const getSpinButton = ( container: HTMLElement, ariaLabel: string ) => {
		const button = container.querySelector(
			`button[aria-label="${ ariaLabel }"]`
		);

		if ( ! ( button instanceof HTMLButtonElement ) ) {
			throw new Error(
				`Expected a spin button labelled "${ ariaLabel }".`
			);
		}

		return button;
	};

	// Spin buttons stay perceivable when disabled (accessibleWhenDisabled),
	// so the disabled state surfaces as aria-disabled, not [disabled].
	const isSpinButtonDisabled = ( button: HTMLButtonElement ) =>
		button.disabled || button.getAttribute( 'aria-disabled' ) === 'true';

	describe( 'number fields', () => {
		const numberField: SettingsUIField = {
			id: 'wc_test_number',
			label: 'Low stock threshold',
			type: 'number',
			customAttributes: { min: 0, step: 1 },
		};

		it( 'renders a number input with custom spin buttons instead of native spinners', () => {
			const container = render(
				<NativeSettingsField { ...makeProps( numberField, 5 ) } />
			);

			const input = container.querySelector( 'input[type="number"]' );
			expect( input ).not.toBeNull();
			expect( input?.getAttribute( 'min' ) ).toBe( '0' );
			expect( input?.getAttribute( 'step' ) ).toBe( '1' );

			expect(
				getSpinButton( container, 'Increment Low stock threshold' )
			).toBeInstanceOf( HTMLButtonElement );
			expect(
				getSpinButton( container, 'Decrement Low stock threshold' )
			).toBeInstanceOf( HTMLButtonElement );
		} );

		it( 'uses canonical validation bounds when custom attributes omit them', () => {
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							validation: { min: 2, max: 8 },
							customAttributes: { step: 0.5 },
						},
						5
					) }
				/>
			);
			const input = container.querySelector( 'input[type="number"]' );

			expect( input ).toHaveAttribute( 'min', '2' );
			expect( input ).toHaveAttribute( 'max', '8' );
			expect( input ).toHaveAttribute( 'step', '0.5' );
		} );

		it( 'honors placeholder and disabled custom attributes for number inputs', () => {
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							customAttributes: {
								...numberField.customAttributes,
								disabled: 'true',
								placeholder: 'Only configurable in code',
							},
						},
						null
					) }
				/>
			);

			const input = container.querySelector( 'input[type="number"]' );
			expect( input ).toBeInstanceOf( HTMLInputElement );
			expect( input ).toHaveAttribute(
				'placeholder',
				'Only configurable in code'
			);
			expect( input?.getAttribute( 'min' ) ).toBe( '0' );
			expect( input?.getAttribute( 'step' ) ).toBe( '1' );
			expect( ( input as HTMLInputElement ).disabled ).toBe( true );
			expect(
				isSpinButtonDisabled(
					getSpinButton( container, 'Increment Low stock threshold' )
				)
			).toBe( true );
			expect(
				isSpinButtonDisabled(
					getSpinButton( container, 'Decrement Low stock threshold' )
				)
			).toBe( true );
		} );

		it( 'uses presence semantics for disabled custom attributes on number inputs', () => {
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							customAttributes: {
								...numberField.customAttributes,
								disabled: 'false',
							},
						},
						5
					) }
				/>
			);

			const input = container.querySelector( 'input[type="number"]' );
			expect( input ).toBeInstanceOf( HTMLInputElement );
			expect( ( input as HTMLInputElement ).disabled ).toBe( true );
			expect(
				isSpinButtonDisabled(
					getSpinButton( container, 'Increment Low stock threshold' )
				)
			).toBe( true );
			expect(
				isSpinButtonDisabled(
					getSpinButton( container, 'Decrement Low stock threshold' )
				)
			).toBe( true );
		} );

		it( 'lets top-level disabled props override number input custom attributes', () => {
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							disabled: false,
							customAttributes: {
								...numberField.customAttributes,
								disabled: 'true',
							},
						},
						5
					) }
				/>
			);

			const input = container.querySelector( 'input[type="number"]' );
			expect( input ).toBeInstanceOf( HTMLInputElement );
			expect( ( input as HTMLInputElement ).disabled ).toBe( false );
			expect(
				isSpinButtonDisabled(
					getSpinButton( container, 'Increment Low stock threshold' )
				)
			).toBe( false );
			expect(
				isSpinButtonDisabled(
					getSpinButton( container, 'Decrement Low stock threshold' )
				)
			).toBe( false );
		} );

		it( 'calls onChange with the stepped value and announces it when a spin button is clicked', () => {
			const onChange = jest.fn();
			const container = render(
				<NativeSettingsField
					{ ...makeProps( numberField, 5, onChange ) }
				/>
			);

			clickButton(
				getSpinButton( container, 'Increment Low stock threshold' )
			);

			expect( onChange ).toHaveBeenCalledWith( 6 );
			expect( speak ).toHaveBeenCalledWith( '6' );
		} );

		it( 'disables the decrement button at the minimum value', () => {
			const container = render(
				<NativeSettingsField { ...makeProps( numberField, 0 ) } />
			);

			expect(
				isSpinButtonDisabled(
					getSpinButton( container, 'Decrement Low stock threshold' )
				)
			).toBe( true );
			expect(
				isSpinButtonDisabled(
					getSpinButton( container, 'Increment Low stock threshold' )
				)
			).toBe( false );
		} );

		it( 'disables the increment button at the maximum value', () => {
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							customAttributes: { min: 0, max: 10, step: 1 },
						},
						10
					) }
				/>
			);

			expect(
				isSpinButtonDisabled(
					getSpinButton( container, 'Increment Low stock threshold' )
				)
			).toBe( true );
			expect(
				isSpinButtonDisabled(
					getSpinButton( container, 'Decrement Low stock threshold' )
				)
			).toBe( false );
		} );

		it( 'falls back to a step of 1 when the schema provides a non-positive step', () => {
			const onChange = jest.fn();
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							customAttributes: { min: 0, step: 0 },
						},
						5,
						onChange
					) }
				/>
			);

			clickButton(
				getSpinButton( container, 'Increment Low stock threshold' )
			);

			expect( onChange ).toHaveBeenCalledWith( 6 );
		} );

		it( 'clamps stepping to the maximum and avoids float precision drift', () => {
			const onChange = jest.fn();
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							customAttributes: { min: 0, max: 0.3, step: 0.2 },
						},
						0.1,
						onChange
					) }
				/>
			);

			clickButton(
				getSpinButton( container, 'Increment Low stock threshold' )
			);

			expect( onChange ).toHaveBeenCalledWith( 0.3 );
		} );

		it( 'preserves current value precision when it exceeds step precision', () => {
			const onChange = jest.fn();
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							customAttributes: { min: 0, step: 0.1 },
						},
						0.05,
						onChange
					) }
				/>
			);

			clickButton(
				getSpinButton( container, 'Increment Low stock threshold' )
			);

			expect( onChange ).toHaveBeenCalledWith( 0.15 );
		} );

		it( 'handles scientific-notation steps', () => {
			const onChange = jest.fn();
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							customAttributes: { min: 0, step: 1e-7 },
						},
						0,
						onChange
					) }
				/>
			);

			clickButton(
				getSpinButton( container, 'Increment Low stock threshold' )
			);

			expect( onChange ).toHaveBeenCalledWith( 1e-7 );
		} );

		it( 'does not exceed toFixed precision limits for tiny scientific-notation steps', () => {
			const onChange = jest.fn();
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							customAttributes: { min: 0, step: 1e-200 },
						},
						0,
						onChange
					) }
				/>
			);

			expect( () =>
				clickButton(
					getSpinButton( container, 'Increment Low stock threshold' )
				)
			).not.toThrow();
			expect( onChange ).toHaveBeenCalledWith( 1e-200 );
		} );

		it( 'steps onto the minimum from an empty value', () => {
			const onChange = jest.fn();
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							...numberField,
							customAttributes: { min: 2, step: 1 },
						},
						null,
						onChange
					) }
				/>
			);

			clickButton(
				getSpinButton( container, 'Increment Low stock threshold' )
			);

			expect( onChange ).toHaveBeenCalledWith( 2 );
		} );

		it( 'keeps sequential number edits canonical', () => {
			const onChange = jest.fn();
			const container = renderStatefulField( numberField, 5, onChange );

			clickButton(
				getSpinButton( container, 'Increment Low stock threshold' )
			);
			clickButton(
				getSpinButton( container, 'Increment Low stock threshold' )
			);

			expect( onChange.mock.calls.map( ( [ value ] ) => value ) ).toEqual(
				[ 6, 7 ]
			);
		} );

		it( 'preserves draft text while typing and commits its canonical value on blur', () => {
			const onChange = jest.fn();
			const container = renderStatefulField( numberField, 5, onChange );
			const input = container.querySelector( 'input[type="number"]' );

			expect( input ).toBeInstanceOf( HTMLInputElement );
			changeInput( input as HTMLInputElement, '10.0' );
			expect( ( input as HTMLInputElement ).value ).toBe( '10.0' );
			expect( onChange ).not.toHaveBeenCalled();

			blurInput( input as HTMLInputElement );
			expect( onChange ).toHaveBeenLastCalledWith( 10 );
			expect( ( input as HTMLInputElement ).value ).toBe( '10' );
		} );

		it( 'syncs an external value change without resetting draft text on unrelated renders', () => {
			const onChange = jest.fn();

			const ExternallyControlledField = () => {
				const [ value, setValue ] = useState< SettingsValue >( 5 );
				const [ renderCount, setRenderCount ] = useState( 0 );

				return (
					<>
						<button
							onClick={ () => setRenderCount( renderCount + 1 ) }
						>
							Re-render
						</button>
						<button onClick={ () => setValue( 8 ) }>
							Set external value
						</button>
						<NativeSettingsField
							{ ...makeProps( numberField, value, onChange ) }
						/>
					</>
				);
			};

			const container = render( <ExternallyControlledField /> );
			const input = container.querySelector( 'input[type="number"]' );
			const buttons = container.querySelectorAll( 'button' );

			expect( input ).toBeInstanceOf( HTMLInputElement );
			changeInput( input as HTMLInputElement, '10.0' );
			clickButton( buttons[ 0 ] );
			expect( ( input as HTMLInputElement ).value ).toBe( '10.0' );

			clickButton( buttons[ 1 ] );
			expect( ( input as HTMLInputElement ).value ).toBe( '8' );
			expect( onChange ).not.toHaveBeenCalled();
		} );

		it( 'commits null on blur when a number is cleared', () => {
			const onChange = jest.fn();
			const container = renderStatefulField( numberField, 5, onChange );
			const input = container.querySelector( 'input[type="number"]' );

			expect( input ).toBeInstanceOf( HTMLInputElement );
			changeInput( input as HTMLInputElement, '' );
			expect( onChange ).not.toHaveBeenCalled();
			blurInput( input as HTMLInputElement );
			expect( onChange ).toHaveBeenLastCalledWith( null );
		} );

		it( 'shows an accessible error and does not commit an unsafe number', () => {
			const onChange = jest.fn();
			const container = renderStatefulField( numberField, 5, onChange );
			const input = container.querySelector( 'input[type="number"]' );

			expect( input ).toBeInstanceOf( HTMLInputElement );
			changeInput( input as HTMLInputElement, '9007199254740992' );
			blurInput( input as HTMLInputElement );

			expect( onChange ).not.toHaveBeenCalled();
			expect( input ).toHaveAttribute( 'aria-invalid', 'true' );
			expect( ( input as HTMLInputElement ).checkValidity() ).toBe(
				false
			);
			const error = container.querySelector( '#wc_test_number__error' );
			expect( error ).toHaveAttribute( 'role', 'alert' );
			expect( error ).toHaveTextContent( 'Enter a valid number.' );
			expect( input?.getAttribute( 'aria-describedby' ) ).toContain(
				'wc_test_number__error'
			);
		} );

		it( 'rejects decimal values that change during canonicalization', () => {
			expect( toCanonicalNumberValue( '01.2500e0' ) ).toBe( 1.25 );
			expect(
				toCanonicalNumberValue( '0.10000000000000001' )
			).toBeNull();
			expect(
				toCanonicalNumberValue( '1.0000000000000000001' )
			).toBeNull();
			expect( toCanonicalNumberValue( '1e-324' ) ).toBeNull();
		} );
	} );

	describe( 'integer fields', () => {
		it( 'uses NumberSpinControl and emits safe integers rather than text', () => {
			const onChange = jest.fn();
			const container = renderStatefulField(
				{
					id: 'wc_test_integer',
					label: 'Items per row',
					type: 'integer',
					customAttributes: { min: 1, step: 1 },
				},
				2,
				onChange
			);

			expect(
				container.querySelector( 'input[type="number"]' )
			).toBeInstanceOf( HTMLInputElement );
			expect(
				container.querySelector( 'input[type="text"]' )
			).toBeNull();
			clickButton(
				getSpinButton( container, 'Increment Items per row' )
			);
			expect( onChange ).toHaveBeenLastCalledWith( 3 );
		} );

		it.each( [
			[ 'fractional', '2.5' ],
			[ 'unsafe', '9007199254740992' ],
		] )( 'does not commit %s integer input', ( _case, nextValue ) => {
			const onChange = jest.fn();
			const container = renderStatefulField(
				{
					id: 'wc_test_integer',
					label: 'Items per row',
					type: 'integer',
				},
				2,
				onChange
			);
			const input = container.querySelector( 'input[type="number"]' );

			expect( input ).toBeInstanceOf( HTMLInputElement );
			changeInput( input as HTMLInputElement, nextValue );
			blurInput( input as HTMLInputElement );

			expect( onChange ).not.toHaveBeenCalled();
			expect( input ).toHaveAttribute( 'aria-invalid', 'true' );
			expect(
				container.querySelector( '#wc_test_integer__error' )
			).toHaveTextContent( 'Enter a valid whole number.' );
		} );
	} );

	describe( 'datetime-local fields', () => {
		it( 'rejects invalid datetime strings', () => {
			expect( toCanonicalDateTime( '2026-13-40T25:61' ) ).toBeNull();
		} );

		it.each( [
			[ 'date', '2026-08-03', '2026-01-01', '2026-12-31', '1' ],
			[ 'time', '12:30', '09:00', '17:00', '900' ],
			[
				'datetime-local',
				'2026-08-03T12:30',
				'2026-08-03T09:00',
				'2026-08-03T17:00',
				'any',
			],
		] )(
			'passes range attributes to %s inputs',
			( type, value, min, max, step ) => {
				const container = render(
					<NativeSettingsField
						{ ...makeProps(
							{
								id: `wc_test_${ type }`,
								label: 'Range field',
								type,
								customAttributes: { min, max, step },
							},
							value
						) }
					/>
				);
				const input = container.querySelector(
					`input[type="${ type }"]`
				);

				expect( input ).toHaveAttribute( 'min', min );
				expect( input ).toHaveAttribute( 'max', max );
				expect( input ).toHaveAttribute( 'step', step );
			}
		);

		it( 'displays canonical state as local wall time and emits a store-timezone offset', () => {
			setDateSettings( {
				...originalDateSettings,
				timezone: {
					...originalDateSettings.timezone,
					offset: '-5',
					offsetFormatted: '-05:00',
					string: 'America/New_York',
				},
			} );
			const onChange = jest.fn();
			const container = renderStatefulField(
				{
					id: 'wc_test_starts_at',
					label: 'Starts at',
					type: 'datetime-local',
				},
				'2026-01-01T17:30:00Z',
				onChange
			);
			const input = container.querySelector(
				'input[type="datetime-local"]'
			);

			expect( input ).toBeInstanceOf( HTMLInputElement );
			expect( input ).toHaveValue( '2026-01-01T12:30' );
			changeInput( input as HTMLInputElement, '2026-01-01T13:45:00' );
			expect( onChange ).toHaveBeenLastCalledWith(
				'2026-01-01T13:45:00-05:00'
			);
			changeInput( input as HTMLInputElement, '' );
			expect( onChange ).toHaveBeenLastCalledWith( null );
		} );
	} );

	describe( 'select fields', () => {
		it( 'renders a public select control and propagates scalar values', () => {
			const onChange = jest.fn();
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							id: 'wc_test_select',
							label: 'Inventory format',
							description: 'Choose how inventory is displayed.',
							type: 'select',
							options: [
								{ value: 'one', label: 'One' },
								{ value: 'two', label: 'Two' },
							],
						},
						'one',
						onChange
					) }
				/>
			);

			const select = container.querySelector( 'select' );
			expect( select ).toBeInstanceOf( HTMLSelectElement );
			expect( select ).toHaveValue( 'one' );
			expect( container.textContent ).toContain( 'Inventory format' );
			expect( container.textContent ).toContain(
				'Choose how inventory is displayed.'
			);

			act( () => {
				if ( select instanceof HTMLSelectElement ) {
					select.value = 'two';
					select.dispatchEvent(
						new Event( 'change', {
							bubbles: true,
							cancelable: true,
						} )
					);
				}
			} );

			expect( onChange ).toHaveBeenCalledWith( 'two' );
		} );

		it.each( [
			[ 'an empty option list', [], '' ],
			[
				'an unmatched stored value',
				[ { label: 'One', value: 'one' } ],
				'legacy',
			],
		] )(
			'keeps the labeled control for %s',
			( _scenario, options, value ) => {
				const container = render(
					<NativeSettingsField
						{ ...makeProps(
							{
								id: 'wc_test_select',
								label: 'Test select',
								type: 'select',
								options,
							},
							value
						) }
					/>
				);

				const select = container.querySelector( 'select' );
				expect( select ).toBeInstanceOf( HTMLSelectElement );
				expect( select ).toHaveAccessibleName( 'Test select' );
				expect( select ).toHaveValue( value );
				expect( select?.selectedOptions[ 0 ] ).toHaveTextContent(
					'Select'
				);
				expect( select?.selectedOptions[ 0 ] ).toBeDisabled();
			}
		);

		it.each( [ {}, 'invalid' ] )(
			'handles malformed non-array options without throwing',
			( options ) => {
				const field = {
					id: 'wc_test_select',
					label: 'Test select',
					type: 'select' as const,
					options,
				} as unknown as SettingsUIField;

				const container = render(
					<NativeSettingsField { ...makeProps( field, 'legacy' ) } />
				);

				const select = container.querySelector( 'select' );
				expect( select ).toBeInstanceOf( HTMLSelectElement );
				expect( select ).toHaveValue( 'legacy' );
				expect( select?.options ).toHaveLength( 1 );
			}
		);
	} );

	describe( 'text fields', () => {
		it( 'renders text fields without spin buttons', () => {
			const container = render(
				<NativeSettingsField
					{ ...makeProps(
						{
							id: 'wc_test_text',
							label: 'Store name',
							type: 'text',
						},
						'hello'
					) }
				/>
			);

			expect(
				container.querySelector( 'input[type="text"]' )
			).not.toBeNull();
			expect(
				container.querySelector( '.wc-settings-ui__number-control' )
			).toBeNull();
		} );
	} );

	it( 'reports which field types have a native renderer', () => {
		expect( isNativeSettingsFieldType( 'text' ) ).toBe( true );
		expect( isNativeSettingsFieldType( 'select' ) ).toBe( true );
		expect( isNativeSettingsFieldType( 'extension_defined' ) ).toBe(
			false
		);
	} );
} );
