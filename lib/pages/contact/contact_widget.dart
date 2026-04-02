import 'package:flutter/material.dart';
import 'package:koinonia_coffee_project/constants_library.dart';
import 'package:koinonia_coffee_project/pages/contact/contact_bloc.dart';
import 'package:koinonia_coffee_project/utils/helpers.dart';

class ContactWidget extends StatefulWidget {
  const ContactWidget({super.key, required this.bloc});

  final ContactBloc bloc;

  @override
  State<ContactWidget> createState() => _ContactWidgetState();
}

class _ContactWidgetState extends State<ContactWidget> {
  Widget _buildNavItem(
    String labelText,
    String validatorText,
    TextEditingController controller,
  ) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: labelText,
        labelStyle: TextStyle(
          fontFamily: ConstantsLibrary.clBodyFont,
          color: ConstantsLibrary.clMidnightPrimaryColor,
        ),
        filled: true,
        fillColor: ConstantsLibrary.clWhiteColor,
        border: const OutlineInputBorder(),
        focusedBorder: OutlineInputBorder(
          borderSide: BorderSide(
            color: ConstantsLibrary.clMidnightPrimaryColor,
            width: 2,
          ),
        ),
      ),
      validator: (value) {
        if (value == null || value.isEmpty) {
          return validatorText;
        }
        if (labelText == 'Email' && !value.contains('@')) {
          return 'Please enter a valid email';
        }
        return null;
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(minHeight: getAvailableHeight(context)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 40),
        decoration: BoxDecoration(color: ConstantsLibrary.clPearlPrimaryColor),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Contact us!',
                    style: TextStyle(
                      fontFamily: ConstantsLibrary.clPrimaryFont,
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: ConstantsLibrary.clMidnightPrimaryColor,
                    ),
                  ),
                  Text(
                    'We\'d love to hear from you! Whether you have a question, feedback, or just want to say hello, feel free to reach out.',
                    style: TextStyle(
                      fontFamily: ConstantsLibrary.clBodyFont,
                      fontSize: 16,
                      color: ConstantsLibrary.clMidnightPrimaryColor,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Email',
                    style: TextStyle(
                      fontFamily: ConstantsLibrary.clBodyFont,
                      fontSize: 16,
                      color: ConstantsLibrary.clMidnightPrimaryColor,
                    ),
                  ),
                  Text(
                    'hello@koinoniacoffeeproject.com',
                    style: TextStyle(
                      fontFamily: ConstantsLibrary.clBodyFont,
                      fontSize: 16,
                      color: ConstantsLibrary.clMidnightPrimaryColor,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 60),
            Flexible(
              child: Container(
                padding: const EdgeInsets.all(32),
                decoration: BoxDecoration(
                  color: ConstantsLibrary.clSageSecondaryColor,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Form(
                  key: widget.bloc.formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: _buildNavItem(
                              'First Name',
                              'Please enter your first name',
                              widget.bloc.firstNameController,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: _buildNavItem(
                              'Last Name',
                              'Please enter your last name',
                              widget.bloc.lastNameController,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      _buildNavItem(
                        'Phone',
                        'Please enter your phone number',
                        widget.bloc.phoneController,
                      ),
                      const SizedBox(height: 20),
                      _buildNavItem(
                        'Email',
                        'Please enter your email',
                        widget.bloc.emailController,
                      ),
                      const SizedBox(height: 20),
                      _buildNavItem(
                        'Message',
                        'Please enter your message',
                        widget.bloc.messageController,
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: () => widget.bloc.submitForm(context),
                        style: ElevatedButton.styleFrom(
                          backgroundColor:
                              ConstantsLibrary.clEucalyptusSecondaryColor,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: Text(
                          'SEND MESSAGE',
                          style: TextStyle(
                            fontFamily: ConstantsLibrary.clSlugFont,
                            fontSize: 13,
                            fontWeight: FontWeight.w400,
                            letterSpacing: 1,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
