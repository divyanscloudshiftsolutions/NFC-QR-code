import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StepItem {
  num: number;
  label: string;
}

interface AppStepperProps {
  steps: StepItem[];
  currentStep: number;
}

export const AppStepper: React.FC<AppStepperProps> = ({ steps, currentStep }) => {
  return (
    <View style={styles.container}>
      {steps.map((step, idx) => {
        const isDone = currentStep > step.num;
        const isActive = currentStep === step.num;

        return (
          <React.Fragment key={step.num}>
            <View style={styles.stepColumn}>
              <View
                style={[
                  styles.circle,
                  {
                    backgroundColor: isActive || isDone ? '#FF9F1C' : '#232733',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.circleText,
                    {
                      color: isActive || isDone ? '#08090D' : '#8E8E93',
                    },
                  ]}
                >
                  {step.num}
                </Text>
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: isActive || isDone ? '#FF9F1C' : '#8E8E93',
                  },
                ]}
              >
                {step.label}
              </Text>
            </View>

            {idx < steps.length - 1 && (
              <View
                style={[
                  styles.line,
                  {
                    backgroundColor: isDone ? '#FF9F1C' : '#232733',
                  },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  stepColumn: {
    alignItems: 'center',
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  circleText: {
    fontSize: 12,
    fontWeight: '900',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  line: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
    marginTop: -16,
  },
});
