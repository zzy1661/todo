import React, { Component } from 'react';
import { Switch, Select, Row, Col, Tree, Collapse, Checkbox } from 'antd';
import PropTypes from 'prop-types';

import { Form, Icon, Input, Button, DatePicker } from 'antd';
import Item from 'antd/lib/list/Item';
const { RangePicker } = DatePicker;
const FormItem = Form.Item;
const Option = Select.Option;
const TreeNode = Tree.TreeNode;
const Panel = Collapse.Panel;

class CreateTask extends Component {

  static propTypes = {
    username: PropTypes.string,
    userToken: PropTypes.string,
    removeUser: PropTypes.func    
  }

  render() {

    let content = (
      <div className="px-5 mx-auto" style={{ width: '600px' }}>
        <div className="">
          <WrappedCreateForm />
        </div>
      </div>
    )
    return (
      <div>
        <header className="workbench-header">
          <h3>工作台<small className="h6 ml-3">创建任务</small></h3>
        </header>
        {content}
      </div>
    )
  }
}
export default CreateTask;

class CreateForm extends React.Component {
  // state = {
  //     taskName: '新建任务',
  //     describe: ''
  // }
  componentDidMount() {
    this.props.form.setFieldsValue({
      parentask: '父任务'
    })
  }
  handleSubmit = (e) => {
    e.preventDefault();
    this.props.form.validateFields((err, values) => {
      if (!err) {
        console.log('Received values of form: ', values);
      }
    });
  }

  render() {
    const { getFieldDecorator } = this.props.form;
    const formItemLayout = {
      labelCol: {
        xs: { span: 24 },
        sm: { span: 8 },
      },
      wrapperCol: {
        xs: { span: 24 },
        sm: { span: 16 },
      },
    };
    return (
      <Form onSubmit={this.handleSubmit} >
        <FormItem className="mb-1"  {...formItemLayout} label="任务名称">
          {getFieldDecorator('taskName', {
            rules: [{ required: true, message: '任务名称不能为空！' }],
          })(
            <Input placeholder="任务名称" />
          )}
        </FormItem>
        <FormItem className="mb-1"  {...formItemLayout} label="任务描述">
          {getFieldDecorator('describe', {
            rules: [{ required: false }],
          })(
            <Input placeholder="任务描述" />
          )}
        </FormItem>
        <FormItem
          {...formItemLayout}
          label="任务期限"
        >
          {getFieldDecorator('dateRange', {
            rules: [{ type: 'array', required: true, message: '任务时间不能为空!' }],
          })(
            <RangePicker />
          )}
        </FormItem>
        <FormItem className="mb-1"  {...formItemLayout} label="父任务">
          {getFieldDecorator('parentask', {
            rules: [{ required: false}],
          })(
            <Input disabled/>
          )}
        </FormItem>
        <FormItem className="mb-1"  {...formItemLayout} label="父任务">
          {getFieldDecorator('parentask2', {
            rules: [{ required: false}],
          })(
            <Select>
              <Option value="jack">Jack</Option>
              <Option value="lucy">Lucy</Option>
              <Option value="Yiminghe">yiminghe</Option>
            </Select>
          )}
        </FormItem>
        <FormItem className="text-center">
          <Button type="primary" htmlType="submit" className="login-form-button w-50">
            提交
            </Button>
        </FormItem>
      </Form>
    );
  }
}

const WrappedCreateForm = Form.create()(CreateForm);
