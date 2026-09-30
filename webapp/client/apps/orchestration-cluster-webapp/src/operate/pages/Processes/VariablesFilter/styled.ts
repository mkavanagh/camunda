/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import styled from 'styled-components';

const ConditionRow = styled.div`
	display: grid;
	grid-template-columns: minmax(0, 1fr) 10rem minmax(0, 1fr) auto;
	gap: var(--cds-spacing-05);
	align-items: start;
`;

const ConditionList = styled.ul`
	margin: 0;
	padding: 0;
	list-style: none;
	overflow-wrap: anywhere;
`;

const ModalContent = styled.div`
	min-height: 22rem;
	overflow: hidden;
	.cds--list-box__menu {
		z-index: 2;
	}
`;

const ConditionRows = styled.div`
	max-height: 24rem;
	overflow-y: auto;
`;

const ButtonRow = styled.div`
	display: flex;
	justify-content: flex-end;
`;

export {ConditionRow, ConditionList, ModalContent, ConditionRows, ButtonRow};
