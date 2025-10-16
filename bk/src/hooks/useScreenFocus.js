import {useEffect, useContext} from 'react';
import {NavigationContext} from '@react-navigation/native';

/**
 * A hook that safely subscribes to React Navigation's focus and blur events.
 * @param {{onFocus: Function, onBlur: Function}} callbacks - Callbacks for focus and blur.
 */
export const useScreenFocus = ({onFocus, onBlur}) => {
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    if (!navigation) return;

    const focusUnsubscribe = navigation.addListener('focus', () => {
      if (onFocus) onFocus();
    });

    const blurUnsubscribe = navigation.addListener('blur', () => {
      if (onBlur) onBlur();
    });

    return () => {
      focusUnsubscribe();
      blurUnsubscribe();
    };
  }, [navigation, onFocus, onBlur]);
};
