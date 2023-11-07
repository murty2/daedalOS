import styled from "styled-components";

const StyledSuggestions = styled.ol`
  display: grid;
  padding: 9px 0 15px;

  li {
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    height: 51px;
    place-items: start;
    position: relative;
    width: 100%;

    figure {
      display: flex;
      padding: 9px 15px;
      place-items: center;

      figcaption {
        font-size: 15px;
        font-weight: 400;
        padding-left: 13px;
        padding-top: 1px;
        white-space: nowrap;
      }
    }

    &::before {
      border-top: 1px solid rgba(80, 80, 80, 55%);
      content: "";
      height: 100%;
      position: absolute;
      width: 100%;
    }

    &:first-child {
      &::before {
        border-top: none;
      }
    }

    &:hover {
      background-color: rgba(80, 80, 80, 75%);

      &::before {
        border: none;
      }

      + li {
        &::before {
          border-top: none;
        }
      }
    }
  }
`;

export default StyledSuggestions;
