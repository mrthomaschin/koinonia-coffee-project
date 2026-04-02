import 'package:flutter/material.dart';
import 'package:koinonia_coffee_project/constants_library.dart';

double getAvailableHeight(BuildContext context) {
  return MediaQuery.of(context).size.height -
      ConstantsLibrary.clAppBarHeight -
      ConstantsLibrary.clBottomBarHeight;
}
