import React from "react";
import MuiNativeSelect, {
  NativeSelectProps as MuiNativeSelectProps
} from "@material-ui/core/NativeSelect";
import InputBase from "@material-ui/core/InputBase";

import styled from "styled-components";

export type NativeSelectMinimalProps = MuiNativeSelectProps;

const BaseNativeSelect = (props: NativeSelectMinimalProps) => (
  <MuiNativeSelect {...props} input={<InputBase />}>
    {props.children}
  </MuiNativeSelect>
);

const NativeSelect = styled(BaseNativeSelect)`
  font-size: 13px;
  .MuiInputBase-input {
    color: ${props => props.theme.palette.text.disabled};
    padding-left: ${props => props.theme.spacing(1)}px;
    background-color: transparent;
  }
  .MuiNativeSelect-icon {
    color: ${props => props.theme.palette.text.disabled};
  }
  &:hover {
    .MuiNativeSelect-icon,
    .MuiInputBase-input {
      color: ${props => props.theme.palette.text.primary};
    }
  }
`;

export default NativeSelect;