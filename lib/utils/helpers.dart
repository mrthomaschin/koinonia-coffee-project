import 'package:flutter/material.dart';
import 'package:koinonia_coffee_project/constants_library.dart';

double getAvailableHeight(BoxConstraints constraints) {
  return constraints.maxHeight -
      ConstantsLibrary.clAppBarHeight -
      ConstantsLibrary.clBottomBarHeight;
}
